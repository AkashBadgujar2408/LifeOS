using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Assistant.Services;

/// <summary>
/// The Story narrator on the user's own Mistral key. The model gets the narrator's instructions and the page's lines —
/// nothing else, no lookups, no tools — and a narration whose figures aren't all in those lines is asked for once more,
/// then refused. Kept narrations are <c>assistant.Narrations</c>, one per recap/year, rewritten in place.
/// </summary>
public class NarratorService(AppDbContext db, IMistralClient mistral, ISettingsService settingsService) : INarratorService
{
    public async Task<OperationResult<NarrationDto>> NarrateAsync(NarrateRequest request, CancellationToken cancellationToken)
    {
        var row = await db.AssistantSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (row?.ApiKeySecret is null)
        {
            return OperationResult<NarrationDto>.Fail("Add your Mistral API key in Settings › AI assistant to start.");
        }

        if (!row.IsEnabled)
        {
            return OperationResult<NarrationDto>.Fail("The assistant is switched off — switch it on in Settings › AI assistant.");
        }

        if (NarrationRules.CheckScope(request.Scope, request.Year, request.Today) is { } badScope)
        {
            return OperationResult<NarrationDto>.Fail(badScope);
        }

        if (await StoryHiddenAsync(request.Scope))
        {
            return OperationResult<NarrationDto>.Fail("Story is switched off in Settings › Modules.");
        }

        var lines = NarrationRules.Shown(request.Lines);
        if (NarrationRules.CheckLines(lines) is { } badLines)
        {
            return OperationResult<NarrationDto>.Fail(badLines);
        }

        var instructions = NarrationRules.Instructions(request.Scope);
        var input = NarrationRules.Input(lines);
        var sent = new List<SentItemDto>
        {
            new() { Label = "Narrator — instructions", Content = instructions },
            new() { Label = "Narrator — the lines on the page", Content = input },
        };
        var messages = new List<MistralMessage>
        {
            new() { Role = "system", Content = instructions },
            new() { Role = "user", Content = input },
        };

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var answer = await mistral.ChatAsync(row.ApiKeySecret, new MistralChatRequest
            {
                Model = row.Model,
                Messages = messages,
                Temperature = attempt == 0 ? 0.5 : 0,
                MaxTokens = 700,
            }, cancellationToken);
            if (!answer.IsOk)
            {
                return OperationResult<NarrationDto>.Fail(AssistantRules.OutcomeMessage(answer.Outcome, answer.Detail));
            }

            var text = answer.Value!.Content?.Trim();
            if (string.IsNullOrEmpty(text))
            {
                return OperationResult<NarrationDto>.Fail("Mistral sent back an empty narration. Try Narrate again.");
            }

            var unknown = NarrationRules.UnknownNumbers(text, lines);
            if (unknown.Count == 0)
            {
                return OperationResult<NarrationDto>.Ok(new NarrationDto { Text = text, Sent = sent });
            }

            // One more try, told which figures weren't on the page — that note is sent too, so it's shown.
            var retry = NarrationRules.Retry(unknown);
            messages.Add(new MistralMessage { Role = "assistant", Content = text });
            messages.Add(new MistralMessage { Role = "user", Content = retry });
            sent.Add(new SentItemDto { Label = "Narrator — its first try (sent back)", Content = text });
            sent.Add(new SentItemDto { Label = "Narrator — asked again", Content = retry });
        }

        return OperationResult<NarrationDto>.Fail(NarrationRules.Unverified);
    }

    public async Task<KeptNarrationDto?> GetKeptAsync(string scope, int? year) =>
        await db.Narrations.AsNoTracking()
            .Where(n => n.Scope == scope && n.Year == year)
            .Select(n => new KeptNarrationDto { Scope = n.Scope, Year = n.Year, Text = n.Text, KeptAt = n.UpdatedAt ?? n.CreatedAt })
            .FirstOrDefaultAsync();

    public async Task<OperationResult<KeptNarrationDto>> KeepAsync(KeepNarrationRequest request)
    {
        if (NarrationRules.CheckScope(request.Scope, request.Year, request.Today) is { } badScope)
        {
            return OperationResult<KeptNarrationDto>.Fail(badScope);
        }

        var text = request.Text.Trim();
        if (text.Length == 0)
        {
            return OperationResult<KeptNarrationDto>.Fail("There's no narration to keep.");
        }

        var kept = await db.Narrations.FirstOrDefaultAsync(n => n.Scope == request.Scope && n.Year == request.Year);
        if (kept is null)
        {
            kept = new Narration { UserId = db.CurrentUserId!.Value, Scope = request.Scope, Year = request.Year, Text = text };
            db.Narrations.Add(kept);
        }
        else
        {
            kept.Text = text;
            kept.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return OperationResult<KeptNarrationDto>.Ok(new KeptNarrationDto
        {
            Scope = kept.Scope,
            Year = kept.Year,
            Text = kept.Text,
            KeptAt = kept.UpdatedAt ?? kept.CreatedAt,
        });
    }

    public async Task RemoveKeptAsync(string scope, int? year)
    {
        var kept = await db.Narrations.FirstOrDefaultAsync(n => n.Scope == scope && n.Year == year);
        if (kept is null)
        {
            return;
        }

        kept.IsDeleted = true;
        kept.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task<bool> StoryHiddenAsync(string scope)
    {
        if (scope != NarrationScopes.Recap)
        {
            return false;
        }

        var settings = await settingsService.GetAsync();
        return settings.Data?.HiddenModules.Contains(ModuleKeys.Story) ?? false;
    }
}
