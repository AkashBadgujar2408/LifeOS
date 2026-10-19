using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Health.Services;

/// <summary>
/// The health profile. Its notes are encrypted at rest by the context (SensitiveColumns) — nothing here encrypts.
/// Callers have already passed the vault unlock (the Health controllers refuse without it).
/// </summary>
public class HealthProfileService(AppDbContext db) : IHealthProfileService
{
    public async Task<HealthProfileDto> GetAsync(DateOnly today)
    {
        var profile = await db.HealthProfiles.AsNoTracking().FirstOrDefaultAsync();
        return profile is null ? new HealthProfileDto() : ToDto(profile, today);
    }

    public async Task<OperationResult<HealthProfileDto>> SaveAsync(HealthProfileRequest request)
    {
        var error = HealthRules.CheckProfile(request);
        if (error is not null)
        {
            return OperationResult<HealthProfileDto>.Fail(error);
        }

        var profile = await db.HealthProfiles.FirstOrDefaultAsync();
        if (profile is null)
        {
            profile = new HealthProfile { UserId = db.CurrentUserId!.Value };
            db.HealthProfiles.Add(profile);
        }

        profile.DateOfBirth = request.DateOfBirth;
        profile.Sex = request.Sex;
        profile.BloodGroup = request.BloodGroup;
        profile.HeightCm = request.HeightCm is { } height ? Math.Round(height, 1, MidpointRounding.AwayFromZero) : null;
        profile.IsOrganDonor = request.IsOrganDonor;
        profile.Notes = HealthRules.Text(request.Notes);
        profile.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two first saves at once: the other one made the profile; this one wins on the next save.
            return OperationResult<HealthProfileDto>.Fail("Your profile was just saved from somewhere else — reload and try again.");
        }

        return OperationResult<HealthProfileDto>.Ok(ToDto(profile, request.Today));
    }

    private static HealthProfileDto ToDto(HealthProfile p, DateOnly today) => new()
    {
        DateOfBirth = p.DateOfBirth,
        Sex = p.Sex,
        BloodGroup = p.BloodGroup,
        HeightCm = p.HeightCm,
        IsOrganDonor = p.IsOrganDonor,
        Notes = p.Notes,
        Age = p.DateOfBirth is { } born ? HealthRules.Age(born, today) : null,
        UpdatedAt = p.UpdatedAt,
    };
}
