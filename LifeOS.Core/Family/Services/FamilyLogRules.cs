using System.Text.RegularExpressions;
using LifeOS.Core.Family.DTOs;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Checks for interactions, gifts and responsibilities (Session 74) that mirror people.*'s CHECKs, so a wrong request
/// gets a clean message instead of a database error — plus the ones a CHECK can't make (no day ahead). Pure,
/// xUnit-tested.
/// </summary>
public static partial class FamilyLogRules
{
    public const int MaxPeoplePerInteraction = 50;

    public static string? CheckInteraction(string kind, DateOnly occurredOn, int peopleCount, DateOnly today)
    {
        if (!InteractionKinds.All.Contains(kind))
        {
            return "Choose how you were in touch.";
        }

        if (occurredOn > today)
        {
            return "That day hasn't come yet.";
        }

        if (peopleCount == 0)
        {
            return "Choose who it was with.";
        }

        return peopleCount > MaxPeoplePerInteraction ? $"Keep it to {MaxPeoplePerInteraction} people." : null;
    }

    public static string? CheckGift(string title, string status, decimal? estimatedAmount, string? currency, string? link,
        int? purchaseId, DateOnly? givenOn, DateOnly today)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return "Say what the gift is.";
        }

        if (!GiftStatuses.All.Contains(status))
        {
            return "Choose whether it's an idea, bought or given.";
        }

        if ((estimatedAmount is null) != (currency is null))
        {
            return estimatedAmount is null ? "Give the amount too, or leave the currency out." : "Choose the currency.";
        }

        if (estimatedAmount is < 0)
        {
            return "The amount can't be below zero.";
        }

        if (currency is not null && !CurrencyCode().IsMatch(currency))
        {
            return "A currency is a three-letter code like INR.";
        }

        if (link is not null && !IsWebAddress(link))
        {
            return "A link starts with http:// or https://.";
        }

        if (purchaseId is not null && status == GiftStatuses.Idea)
        {
            return "Only a bought or given gift has a purchase.";
        }

        if (status == GiftStatuses.Given)
        {
            if (givenOn is null)
            {
                return "Say the day it was given.";
            }

            if (givenOn > today)
            {
                return "That day hasn't come yet.";
            }
        }
        else if (givenOn is not null)
        {
            return "Only a given gift has a day it was given.";
        }

        return null;
    }

    public static string? CheckResponsibility(string title, string heldBy, int? holderContactId, DateOnly? startedOn, DateOnly? endedOn)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return "Say what the responsibility is.";
        }

        if (!ResponsibilityHolders.All.Contains(heldBy))
        {
            return "Choose who looks after it.";
        }

        if (heldBy == ResponsibilityHolders.Me && holderContactId is not null)
        {
            return "It's yours — leave the other person out, or choose Shared.";
        }

        if (heldBy == ResponsibilityHolders.Someone && holderContactId is null)
        {
            return "Choose who looks after it.";
        }

        return endedOn is not null && startedOn is not null && endedOn < startedOn
            ? "It can't end before it started."
            : null;
    }

    public static bool IsWebAddress(string link) =>
        Uri.TryCreate(link, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
        && uri.Host.Length > 0;

    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex CurrencyCode();
}

/// <summary>
/// "Keep in touch every N days" (Session 74): when the next touch is due, from the last day you were in touch (or the
/// day the cadence was set, for someone never contacted — so setting one doesn't nudge straight away). Pure. Gentle:
/// past due is a nudge, never a score.
/// </summary>
public static class KeepInTouchRules
{
    public const int MinCadence = 1;
    public const int MaxCadence = 730;

    public static DateOnly DueOn(DateOnly? lastContactedOn, DateOnly setOn, int cadenceDays) =>
        (lastContactedOn ?? setOn).AddDays(cadenceDays);

    /// <summary>Days until due (negative = that many days past it).</summary>
    public static int DaysUntil(DateOnly dueOn, DateOnly today) => dueOn.DayNumber - today.DayNumber;

    public static string? CheckCadence(int cadenceDays) =>
        cadenceDays is < MinCadence or > MaxCadence ? "Choose between 1 day and 2 years." : null;

    /// <summary>"Due in 3 days", "Due today", "4 days past" — the wording used everywhere.</summary>
    public static string Describe(int daysUntil) => daysUntil switch
    {
        0 => "Due today",
        1 => "Due tomorrow",
        > 1 => $"Due in {daysUntil} days",
        -1 => "A day past",
        _ => $"{-daysUntil} days past",
    };

    /// <summary>The My Day nudge: plain and kind ("It's been a while since you were in touch with Asha.").</summary>
    public static string Nudge(string name, DateOnly? lastContactedOn, DateOnly today) =>
        lastContactedOn is { } last
            ? $"It's been {today.DayNumber - last.DayNumber} days since you were in touch with {name}. A quick call or message?"
            : $"You wanted to keep in touch with {name}. A quick call or message?";
}
