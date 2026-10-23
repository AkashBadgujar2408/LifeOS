using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Assistant.Services;

/// <summary>
/// One <c>assistant.AssistantSettings</c> row per user, created on first save and updated in place (EF maps it
/// one-to-one). <c>ApiKeySecret</c> is encrypted by SensitiveColumns; this service is the only place that reads it,
/// and only to call Mistral — it is never put in a DTO.
/// </summary>
public class AssistantSettingsService(AppDbContext db, IMistralClient mistral) : IAssistantSettingsService
{
    public async Task<AssistantSettingsDto> GetAsync() => ToDto(await FindAsync());

    public async Task<OperationResult<AssistantSettingsDto>> SaveKeyAsync(AssistantKeyRequest request)
    {
        var (key, error) = AssistantRules.CheckKey(request.ApiKey);
        if (key is null)
        {
            return OperationResult<AssistantSettingsDto>.Fail(error!);
        }

        return await SaveAsync(row =>
        {
            row.ApiKeySecret = key;
            row.ApiKeyLast4 = AssistantRules.Last4(key);
            row.ApiKeySetAt = DateTime.UtcNow;
        });
    }

    public async Task<AssistantSettingsDto> RemoveKeyAsync()
    {
        var row = await FindAsync();
        if (row?.ApiKeySecret is not null)
        {
            row.ApiKeySecret = null;
            row.ApiKeyLast4 = null;
            row.ApiKeySetAt = null;
            row.IsEnabled = false;
            row.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        return ToDto(row);
    }

    public async Task<OperationResult<AssistantSettingsDto>> UpdateAsync(AssistantPreferencesRequest request)
    {
        if (AssistantRules.Models.All(m => m.Id != request.Model))
        {
            return OperationResult<AssistantSettingsDto>.Fail("Choose one of the listed models.");
        }

        var existing = await FindAsync();
        if (request.IsEnabled && existing?.ApiKeySecret is null)
        {
            return OperationResult<AssistantSettingsDto>.Fail("Add your Mistral API key first — the assistant can't work without it.");
        }

        return await SaveAsync(row =>
        {
            row.IsEnabled = request.IsEnabled;
            row.Model = request.Model;
        });
    }

    public async Task<OperationResult<AssistantKeyTestDto>> TestKeyAsync(CancellationToken cancellationToken)
    {
        var row = await FindAsync();
        if (row?.ApiKeySecret is null)
        {
            return OperationResult<AssistantKeyTestDto>.Fail("Add your Mistral API key first.");
        }

        var result = await mistral.CheckKeyAsync(row.ApiKeySecret, cancellationToken);
        return OperationResult<AssistantKeyTestDto>.Ok(result.IsOk
            ? new AssistantKeyTestDto { Works = true, Message = "Your key works — Mistral accepted it." }
            : new AssistantKeyTestDto { Works = false, Message = AssistantRules.OutcomeMessage(result.Outcome, result.Detail) });
    }

    /// <summary>The user's live row, if any (the query filter scopes it to them).</summary>
    private Task<AssistantSetting?> FindAsync() => db.AssistantSettings.FirstOrDefaultAsync();

    private async Task<OperationResult<AssistantSettingsDto>> SaveAsync(Action<AssistantSetting> change)
    {
        var row = await FindAsync();
        if (row is null)
        {
            row = new AssistantSetting { UserId = db.CurrentUserId!.Value, Model = AssistantRules.DefaultModel };
            db.AssistantSettings.Add(row);
        }
        else
        {
            row.UpdatedAt = DateTime.UtcNow;
        }

        change(row);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two first saves at once: the other one created the row — apply this change to it instead.
            db.ChangeTracker.Clear();
            var created = await FindAsync();
            if (created is null)
            {
                throw;
            }

            change(created);
            created.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            row = created;
        }

        return OperationResult<AssistantSettingsDto>.Ok(ToDto(row));
    }

    private static AssistantSettingsDto ToDto(AssistantSetting? row) => new()
    {
        IsEnabled = row?.IsEnabled ?? false,
        Model = row?.Model ?? AssistantRules.DefaultModel,
        HasKey = row?.ApiKeySecret is not null,
        KeyLast4 = row?.ApiKeyLast4,
        KeySetAt = row?.ApiKeySetAt,
        Models = [.. AssistantRules.Models],
    };
}
