using System.Text.Json;
using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LifeOS.Core.Assistant.Services;

/// <summary>
/// One answer from the assistant, in two steps: a topic check that sees only the user's new message (so an
/// off-topic question gets the fixed refusal and nothing of theirs is sent), then the answer itself — Mistral with the
/// read-only lookups of <see cref="AssistantTools"/>, run here through the modules' services. Nothing is stored;
/// everything sent is returned in <see cref="ChatReplyDto.Sent"/>.
/// </summary>
public class AssistantService(
    AppDbContext db,
    IMistralClient mistral,
    ISettingsService settingsService,
    IVaultService vaultService,
    IServiceProvider services,
    ILogger<AssistantService> logger) : IAssistantService
{
    public async Task<OperationResult<ChatReplyDto>> ChatAsync(ChatRequest request, CancellationToken cancellationToken)
    {
        var row = await db.AssistantSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (row?.ApiKeySecret is null)
        {
            return OperationResult<ChatReplyDto>.Fail("Add your Mistral API key in Settings › AI assistant to start.");
        }

        if (!row.IsEnabled)
        {
            return OperationResult<ChatReplyDto>.Fail("The assistant is switched off — switch it on in Settings › AI assistant.");
        }

        if (AssistantRules.CheckConversation(request.Messages) is { } invalid)
        {
            return OperationResult<ChatReplyDto>.Fail(invalid);
        }

        var settings = await settingsService.GetAsync();
        var hidden = new HashSet<string>(settings.Data?.HiddenModules ?? [], StringComparer.Ordinal);
        var zone = ZoneOf(request.TimeZone ?? settings.Data?.TimeZone);
        var key = row.ApiKeySecret;
        var sent = new List<SentItemDto>();

        // 1. The topic check: only the new message (and the previous answer, for follow-ups).
        var conversation = AssistantRules.Recent(request.Messages);
        var question = conversation[^1].Content.Trim();
        var previous = conversation.Count > 1 && conversation[^2].Role == ChatRoles.Assistant ? conversation[^2].Content : null;
        var topicInput = AssistantPrompts.TopicInput(previous, question);
        sent.Add(new SentItemDto { Label = "Topic check — instructions", Content = AssistantPrompts.TopicCheck });
        sent.Add(new SentItemDto { Label = "Topic check — your message", Content = topicInput });

        var check = await mistral.ChatAsync(key, new MistralChatRequest
        {
            // The user's own model, so picking another in Settings also helps when one is full.
            Model = row.Model,
            Messages =
            [
                new MistralMessage { Role = "system", Content = AssistantPrompts.TopicCheck },
                new MistralMessage { Role = "user", Content = topicInput },
            ],
            Temperature = 0,
            MaxTokens = 20,
            ResponseFormat = new MistralResponseFormat(),
        }, cancellationToken);
        if (!check.IsOk)
        {
            return OperationResult<ChatReplyDto>.Fail(AssistantRules.OutcomeMessage(check.Outcome, check.Detail));
        }

        if (AssistantRules.ParseTopic(check.Value!.Content) == ChatTopic.Other)
        {
            return OperationResult<ChatReplyDto>.Ok(new ChatReplyDto { Reply = AssistantRules.Refusal, Refused = true, Sent = sent });
        }

        // 2. The answer, with the lookups this user can have right now.
        var healthUnlocked = vaultService.IsUnlocked;
        var tools = AssistantTools.Available(hidden, healthUnlocked);
        var instructions = AssistantPrompts.Instructions(request.Today, zone.Id, hidden, !healthUnlocked);
        var messages = new List<MistralMessage> { new() { Role = "system", Content = instructions } };
        messages.AddRange(conversation.Select(m => new MistralMessage { Role = m.Role, Content = m.Content.Trim() }));
        sent.Add(new SentItemDto { Label = "Instructions", Content = instructions });
        sent.Add(new SentItemDto
        {
            Label = conversation.Count == 1 ? "Your message" : "The conversation",
            Content = string.Join("\n\n", conversation.Select(m => $"{(m.Role == ChatRoles.User ? "You" : "Assistant")}: {m.Content.Trim()}")),
        });

        var context = new AssistantToolContext(request.Today, zone, hidden, services);
        var resultJson = AssistantTools.ResultJson(zone);
        var lookups = new List<string>();
        for (var round = 0; round < AssistantRules.MaxRounds; round++)
        {
            var answer = await mistral.ChatAsync(key, new MistralChatRequest
            {
                Model = row.Model,
                Messages = messages,
                Tools = AssistantTools.Definitions(tools),
                ToolChoice = "auto",
                Temperature = 0.2,
                MaxTokens = 1200,
            }, cancellationToken);
            if (!answer.IsOk)
            {
                return OperationResult<ChatReplyDto>.Fail(AssistantRules.OutcomeMessage(answer.Outcome, answer.Detail));
            }

            var message = answer.Value!;
            if (message.ToolCalls is not { Count: > 0 } calls)
            {
                var reply = message.Content?.Trim();
                var refused = string.IsNullOrEmpty(reply) || AssistantRules.IsRefusal(reply);
                return OperationResult<ChatReplyDto>.Ok(new ChatReplyDto
                {
                    Reply = refused ? AssistantRules.Refusal : reply!,
                    Refused = refused,
                    Lookups = lookups,
                    Sent = sent,
                });
            }

            messages.Add(new MistralMessage { Role = "assistant", Content = message.Content ?? string.Empty, ToolCalls = calls });
            foreach (var call in calls)
            {
                var tool = tools.FirstOrDefault(t => t.Name == call.Function.Name);
                var content = await RunAsync(tool, call, context, resultJson);
                if (tool is not null && !lookups.Contains(tool.Label))
                {
                    lookups.Add(tool.Label);
                }

                messages.Add(new MistralMessage { Role = "tool", Name = call.Function.Name, ToolCallId = call.Id, Content = content });
                sent.Add(new SentItemDto { Label = $"Lookup: {tool?.Label ?? call.Function.Name}", Content = content });
            }
        }

        return OperationResult<ChatReplyDto>.Ok(new ChatReplyDto
        {
            Reply = "I couldn't finish looking that up. Try asking something narrower, like one module or a shorter period.",
            Lookups = lookups,
            Sent = sent,
        });
    }

    /// <summary>One lookup's result as the JSON text sent back to Mistral — an error is a result too, never a crash.</summary>
    private async Task<string> RunAsync(AssistantTool? tool, MistralToolCall call, AssistantToolContext context, JsonSerializerOptions json)
    {
        if (tool is null)
        {
            return JsonSerializer.Serialize(new { error = $"There is no lookup called {call.Function.Name}." }, json);
        }

        object? result;
        try
        {
            result = await tool.Run(context, ToolArgs.Parse(call.Function.Arguments));
            if (tool.Name == AssistantTools.HealthReport)
            {
                // Health left the vault for Mistral: the user sees it in Settings › Vault activity, like an export.
                await vaultService.LogAsync(VaultActions.Opened, null, null, "Health report sent to the AI assistant (Mistral)");
            }
        }
        catch (ToolArgumentException ex)
        {
            result = new { error = ex.Message };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Assistant lookup {Tool} failed", tool.Name);
            result = new { error = "That lookup failed." };
        }

        return AssistantRules.Clip(JsonSerializer.Serialize(result, json), AssistantRules.MaxToolResultLength);
    }

    private static TimeZoneInfo ZoneOf(string? id) =>
        !string.IsNullOrWhiteSpace(id) && TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone) ? zone : TimeZoneInfo.Utc;
}
