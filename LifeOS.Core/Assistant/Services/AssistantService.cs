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
/// read-only lookups of <see cref="AssistantTools"/> and the create/update proposals of <see cref="AssistantActions"/>,
/// run here through the modules' services. A proposal only becomes a card; <see cref="ConfirmAsync"/> writes it when
/// the user presses Confirm, and logs it. Conversations aren't stored; everything sent is returned in
/// <see cref="ChatReplyDto.Sent"/>.
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
        if (NotReady(row) is { } notReady)
        {
            return OperationResult<ChatReplyDto>.Fail(notReady);
        }

        if (AssistantRules.CheckConversation(request.Messages) is { } invalid)
        {
            return OperationResult<ChatReplyDto>.Fail(invalid);
        }

        var settings = await settingsService.GetAsync();
        var hidden = new HashSet<string>(settings.Data?.HiddenModules ?? [], StringComparer.Ordinal);
        var zone = ZoneOf(request.TimeZone ?? settings.Data?.TimeZone);
        var key = row!.ApiKeySecret!;
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
        var actions = AssistantActions.Available(hidden);
        var definitions = AssistantTools.Definitions(tools);
        definitions.AddRange(AssistantActions.Definitions(actions));
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
                Tools = definitions,
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
            var proposals = new List<ProposalDto>();
            foreach (var call in calls)
            {
                if (actions.FirstOrDefault(a => a.Name == call.Function.Name) is { } action)
                {
                    // A proposal: checked and turned into a card, never written here.
                    var (proposal, proposed) = await ProposeAsync(action, call, context, resultJson, proposals.Count);
                    if (proposal is not null)
                    {
                        proposals.Add(proposal);
                    }

                    messages.Add(new MistralMessage { Role = "tool", Name = call.Function.Name, ToolCallId = call.Id, Content = proposed });
                    sent.Add(new SentItemDto { Label = $"Proposal: {call.Function.Name}", Content = proposed });
                    continue;
                }

                var tool = tools.FirstOrDefault(t => t.Name == call.Function.Name);
                var content = await RunAsync(tool, call, context, resultJson);
                if (tool is not null && !lookups.Contains(tool.Label))
                {
                    lookups.Add(tool.Label);
                }

                messages.Add(new MistralMessage { Role = "tool", Name = call.Function.Name, ToolCallId = call.Id, Content = content });
                sent.Add(new SentItemDto { Label = $"Lookup: {tool?.Label ?? call.Function.Name}", Content = content });
            }

            if (proposals.Count > 0)
            {
                // The cards are the answer: the user confirms (or cancels) each one, so there's no further round.
                var text = message.Content?.Trim();
                return OperationResult<ChatReplyDto>.Ok(new ChatReplyDto
                {
                    Reply = string.IsNullOrEmpty(text) || AssistantRules.IsRefusal(text) ? AssistantRules.ProposalReply(proposals.Count) : text,
                    Lookups = lookups,
                    Sent = sent,
                    Proposals = proposals,
                });
            }
        }

        return OperationResult<ChatReplyDto>.Ok(new ChatReplyDto
        {
            Reply = "I couldn't finish looking that up. Try asking something narrower, like one module or a shorter period.",
            Lookups = lookups,
            Sent = sent,
        });
    }

    public async Task<OperationResult<ActionResultDto>> ConfirmAsync(ConfirmActionRequest request)
    {
        var row = await db.AssistantSettings.AsNoTracking().FirstOrDefaultAsync();
        if (NotReady(row) is { } notReady)
        {
            return OperationResult<ActionResultDto>.Fail(notReady);
        }

        // Only the actions that exist — create and update — can be confirmed; there is nothing that deletes.
        if (AssistantActions.Find(request.Action) is not { } action)
        {
            return OperationResult<ActionResultDto>.Fail("The assistant can't do that.");
        }

        var settings = await settingsService.GetAsync();
        var hidden = new HashSet<string>(settings.Data?.HiddenModules ?? [], StringComparer.Ordinal);
        if (action.Module is { } module && hidden.Contains(module))
        {
            return OperationResult<ActionResultDto>.Fail($"{module} is switched off in Settings › Modules.");
        }

        var context = new AssistantToolContext(request.Today, ZoneOf(request.TimeZone ?? settings.Data?.TimeZone), hidden, services);
        ActionPlan plan;
        try
        {
            // Checked again: the item may have changed (or gone) since the card was shown.
            plan = await action.Plan(context, ToolArgs.Parse(request.Arguments));
        }
        catch (ToolArgumentException ex)
        {
            return OperationResult<ActionResultDto>.Fail(ex.Message);
        }

        var written = await plan.Write();
        if (!written.Success)
        {
            return OperationResult<ActionResultDto>.Fail(written.Error!);
        }

        var done = written.Data!;
        db.ActionLogs.Add(new ActionLog
        {
            UserId = db.CurrentUserId!.Value,
            Action = action.Name,
            Kind = done.Kind,
            EntityType = done.EntityType,
            EntityId = done.EntityId,
            Summary = AssistantRules.Clip(plan.Title, 380),
        });
        await db.SaveChangesAsync();

        return OperationResult<ActionResultDto>.Ok(new ActionResultDto
        {
            Kind = done.Kind,
            EntityType = done.EntityType,
            EntityId = done.EntityId,
            Title = done.Title,
            Message = AssistantRules.DoneMessage(plan.Title),
        });
    }

    public async Task<List<ActionLogDto>> GetActionLogAsync(int take) =>
        await db.ActionLogs.AsNoTracking()
            .OrderByDescending(l => l.CreatedAt).ThenByDescending(l => l.Id)
            .Take(Math.Clamp(take, 1, 200))
            .Select(l => new ActionLogDto
            {
                Id = l.Id,
                Action = l.Action,
                Kind = l.Kind,
                EntityType = l.EntityType,
                EntityId = l.EntityId,
                Summary = l.Summary,
                CreatedAt = l.CreatedAt,
            })
            .ToListAsync();

    private static string? NotReady(AssistantSetting? row) =>
        row?.ApiKeySecret is null ? "Add your Mistral API key in Settings › AI assistant to start."
        : !row.IsEnabled ? "The assistant is switched off — switch it on in Settings › AI assistant."
        : null;

    /// <summary>
    /// A proposed create/update checked into a card (nothing written), and what goes back to Mistral: that the card
    /// is waiting for the user, or the error to fix.
    /// </summary>
    private async Task<(ProposalDto? Proposal, string Sent)> ProposeAsync(
        AssistantAction action, MistralToolCall call, AssistantToolContext context, JsonSerializerOptions json, int shown)
    {
        if (shown >= AssistantRules.MaxProposals)
        {
            return (null, JsonSerializer.Serialize(new { error = "Too many changes at once — the user can confirm these first, then ask for more." }, json));
        }

        try
        {
            var args = ToolArgs.Parse(call.Function.Arguments);
            var plan = await action.Plan(context, args);
            var proposal = new ProposalDto
            {
                Action = action.Name,
                Arguments = args.Json,
                Title = plan.Title,
                Lines = plan.Lines.Select(l => new ProposalLineDto { Label = l.Label, Value = l.Value, Before = l.Before }).ToList(),
            };
            return (proposal, JsonSerializer.Serialize(new
            {
                status = "Shown to the user as a card. Nothing is saved until they press Confirm, so don't say it's done.",
                card = plan.Title,
            }, json));
        }
        catch (ToolArgumentException ex)
        {
            return (null, JsonSerializer.Serialize(new { error = ex.Message }, json));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Assistant proposal {Action} failed", action.Name);
            return (null, JsonSerializer.Serialize(new { error = "That couldn't be prepared." }, json));
        }
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
