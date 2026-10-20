using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Birthdays, anniversaries and other yearly days (Session 73). Stored as month + day + optional year; the next
/// occurrence, the age turned and "N years" are SignificantDays on every read. They reach the calendar (every year,
/// <see cref="OccurrencesAsync"/>) and My Day (<see cref="UpcomingAsync"/>, a week ahead) from C#, like subscription
/// renewals — nothing is stored per year.
/// </summary>
public class SignificantDatesService(AppDbContext db) : ISignificantDatesService
{
    private const string NotFound = "Date not found.";
    private const string SecondBirthday = "They already have a birthday — change that one instead.";

    public async Task<List<SignificantDateDto>> GetAllAsync(DateOnly today) =>
        (await LoadAsync(db.SignificantDates)).Select(d => ToDto(d, today)).OrderBy(d => d.NextOn).ThenBy(d => d.Title).ToList();

    public async Task<OperationResult<SignificantDateDto>> CreateAsync(SignificantDateRequest request)
    {
        var date = new SignificantDate { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(date, request) is { } error)
        {
            return OperationResult<SignificantDateDto>.Fail(error);
        }

        db.SignificantDates.Add(date);
        return await SaveAsync(date, request.Today);
    }

    public async Task<OperationResult<SignificantDateDto>> UpdateAsync(int id, SignificantDateRequest request)
    {
        var date = await db.SignificantDates.FindAsync(id);
        if (date is null)
        {
            return OperationResult<SignificantDateDto>.Fail(NotFound);
        }

        if (await ApplyAsync(date, request) is { } error)
        {
            return OperationResult<SignificantDateDto>.Fail(error);
        }

        date.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(date, request.Today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var date = await db.SignificantDates.FindAsync(id);
        if (date is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        date.IsDeleted = true;
        date.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<List<UpcomingDayDto>> UpcomingAsync(DateOnly today, int days) =>
        (await LoadAsync(db.SignificantDates))
        .Select(d => ToDto(d, today))
        .Where(d => d.DaysUntil <= days)
        .OrderBy(d => d.NextOn).ThenBy(d => d.Title)
        .Select(d => new UpcomingDayDto
        {
            Id = d.Id, ContactId = d.ContactId, Kind = d.Kind, Title = d.Title, On = d.NextOn, DaysUntil = d.DaysUntil,
        })
        .ToList();

    /// <summary>Every occurrence in a calendar range (the feed's "Birthdays" source), each year counted afresh.</summary>
    public static async Task<List<(int Id, int ContactId, string Title, DateOnly On)>> OccurrencesAsync(
        AppDbContext db, DateOnly from, DateOnly to) =>
        (await LoadAsync(db.SignificantDates))
        .SelectMany(d => SignificantDays.Between(d.Month, d.Day, d.Year, from, to)
            .Select(on => (d.Id, d.ContactId,
                SignificantDays.Title(d.Kind, d.Label, d.Name, d.OtherName, SignificantDays.YearsOn(d.Year, on.Year)), on)))
        .ToList();

    private async Task<string?> ApplyAsync(SignificantDate date, SignificantDateRequest request)
    {
        if (!SignificantDateKinds.All.Contains(request.Kind))
        {
            return "Choose what kind of day it is.";
        }

        var label = string.IsNullOrWhiteSpace(request.Label) ? null : request.Label.Trim();
        if (request.Kind == SignificantDateKinds.Other && label is null)
        {
            return "Name the day — a remembrance day, a name day…";
        }

        if (request.OtherContactId is not null
            && (request.Kind != SignificantDateKinds.Anniversary || request.OtherContactId == request.ContactId))
        {
            return "Only an anniversary is shared by two people, and they have to be different people.";
        }

        if (SignificantDays.Check(request.Month, request.Day, request.Year, request.Today) is { } dayError)
        {
            return dayError;
        }

        var ids = new[] { (int?)request.ContactId, request.OtherContactId }.OfType<int>().ToList();
        if (await db.Contacts.CountAsync(c => ids.Contains(c.Id)) != ids.Count)
        {
            return "Contact not found.";
        }

        if (request.Kind == SignificantDateKinds.Birthday && await db.SignificantDates.AnyAsync(d =>
                d.ContactId == request.ContactId && d.Kind == SignificantDateKinds.Birthday && d.Id != date.Id))
        {
            return SecondBirthday;
        }

        date.ContactId = request.ContactId;
        date.OtherContactId = request.OtherContactId;
        date.Kind = request.Kind;
        date.Label = label;
        date.Month = (byte)request.Month;
        date.Day = (byte)request.Day;
        date.Year = (short?)request.Year;
        date.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private async Task<OperationResult<SignificantDateDto>> SaveAsync(SignificantDate date, DateOnly today)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<SignificantDateDto>.Fail(SecondBirthday);
        }

        var saved = (await LoadAsync(db.SignificantDates.Where(d => d.Id == date.Id))).First();
        return OperationResult<SignificantDateDto>.Ok(ToDto(saved, today));
    }

    private static async Task<List<DateRow>> LoadAsync(IQueryable<SignificantDate> query) =>
        await query.Select(d => new DateRow(d.Id, d.ContactId, d.Contact.Name, d.OtherContactId,
                d.OtherContact != null ? d.OtherContact.Name : null, d.Kind, d.Label, d.Month, d.Day, d.Year, d.Notes))
            .ToListAsync();

    private static SignificantDateDto ToDto(DateRow d, DateOnly today)
    {
        var next = SignificantDays.Next(d.Month, d.Day, today);
        var years = SignificantDays.YearsOn(d.Year, next.Year);
        return new SignificantDateDto
        {
            Id = d.Id,
            ContactId = d.ContactId,
            ContactName = d.Name,
            OtherContactId = d.OtherContactId,
            OtherContactName = d.OtherName,
            Kind = d.Kind,
            Label = d.Label,
            Month = d.Month,
            Day = d.Day,
            Year = d.Year,
            Notes = d.Notes,
            NextOn = next,
            DaysUntil = next.DayNumber - today.DayNumber,
            YearsOnNext = years,
            Title = SignificantDays.Title(d.Kind, d.Label, d.Name, d.OtherName, years),
        };
    }

    private sealed record DateRow(int Id, int ContactId, string Name, int? OtherContactId, string? OtherName, string Kind,
        string? Label, int Month, int Day, int? Year, string? Notes);
}
