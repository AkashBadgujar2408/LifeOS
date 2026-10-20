using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Family.DTOs;

/// <summary>people.Relationships.Kind values — stable, never renamed once data exists.</summary>
public static class RelationshipKinds
{
    /// <summary>The relative is the person's parent (the one directed kind: a child is the same edge read back).</summary>
    public const string Parent = "Parent";
    public const string Partner = "Partner";
    public const string Sibling = "Sibling";
    /// <summary>Anything else, named by its label ("Cousin", "Godmother").</summary>
    public const string Other = "Other";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Parent, Partner, Sibling, Other], StringComparer.Ordinal);

    /// <summary>Partners and siblings go both ways, so they're stored once (smaller id first, you first of all).</summary>
    public static bool IsMutual(string kind) => kind is Partner or Sibling;
}

/// <summary>people.SignificantDates.Kind values.</summary>
public static class SignificantDateKinds
{
    public const string Birthday = "Birthday";
    public const string Anniversary = "Anniversary";
    public const string Other = "Other";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Birthday, Anniversary, Other], StringComparer.Ordinal);
}

/// <summary>One edge of the family tree: RelativeContactId is PersonContactId's Kind (a null side is you).</summary>
public class RelationshipDto
{
    public int Id { get; init; }
    public int? PersonContactId { get; init; }
    public string? PersonName { get; init; }
    /// <summary>Null = you (Parent only: you are the person's parent).</summary>
    public int? RelativeContactId { get; init; }
    public string? RelativeName { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string? Label { get; init; }
}

public class RelationshipRequest
{
    /// <summary>Null = you.</summary>
    public int? PersonContactId { get; init; }

    /// <summary>Null = you — only as a parent ("I'm Kiran's parent").</summary>
    public int? RelativeContactId { get; init; }

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(50)]
    public string? Label { get; init; }
}

/// <summary>A contact as the Family pages show them: where they sit in the tree and their next birthday.</summary>
public class FamilyPersonDto
{
    public int ContactId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Phone { get; init; }
    public string? Email { get; init; }
    /// <summary>In any relationship at all (the directory's "Family" filter).</summary>
    public bool IsFamily { get; init; }
    /// <summary>What they are to you ("Parent's sibling", "Cousin") — null when the tree doesn't connect them to you.</summary>
    public string? Relation { get; init; }
    /// <summary>Generations above you (+) or below (−); null when not placed (or only an "Other" relation to you).</summary>
    public int? Generation { get; init; }
    public DateOnly? NextBirthday { get; init; }
    /// <summary>The age they turn on it, when the birth year is known.</summary>
    public int? TurnsAge { get; init; }
    public DateOnly? LastContactedOn { get; init; }
}

/// <summary>A significant date with its next occurrence (as of the client's today).</summary>
public class SignificantDateDto
{
    public int Id { get; init; }
    public int ContactId { get; init; }
    public string ContactName { get; init; } = string.Empty;
    public int? OtherContactId { get; init; }
    public string? OtherContactName { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string? Label { get; init; }
    public int Month { get; init; }
    public int Day { get; init; }
    public int? Year { get; init; }
    public string? Notes { get; init; }
    public DateOnly NextOn { get; init; }
    public int DaysUntil { get; init; }
    /// <summary>Years it will be on NextOn (the age turned, years married) — null without a year.</summary>
    public int? YearsOnNext { get; init; }
    /// <summary>"Asha turns 60", "Asha & Ravi's anniversary — 41 years".</summary>
    public string Title { get; init; } = string.Empty;
}

public class SignificantDateRequest
{
    public int ContactId { get; init; }

    /// <summary>Anniversaries only: the second person when it isn't yours ("Asha & Ravi").</summary>
    public int? OtherContactId { get; init; }

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(100)]
    public string? Label { get; init; }

    public int Month { get; init; }

    public int Day { get; init; }

    public int? Year { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    /// <summary>The client's today (for the next occurrence in the reply).</summary>
    public DateOnly Today { get; init; }
}

/// <summary>A birthday or anniversary coming up, for My Day and the Family overview.</summary>
public class UpcomingDayDto
{
    public int Id { get; init; }
    public int ContactId { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public DateOnly On { get; init; }
    public int DaysUntil { get; init; }
}
