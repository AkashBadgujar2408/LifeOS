using System.ComponentModel.DataAnnotations;
using System.Globalization;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using static System.FormattableString;

namespace LifeOS.Core.Assistant.Services;

public static class ActionKinds
{
    public const string Created = "Created";
    public const string Updated = "Updated";
}

/// <summary>One line of a confirmation card: what will be set, and on an update what it was before.</summary>
public sealed record ActionLine(string Label, string Value, string? Before = null);

/// <summary>What a confirmed action wrote: the item to link to (EntityLinks type strings) and its title.</summary>
public sealed record ActionDone(string Kind, string EntityType, int EntityId, string Title);

/// <summary>
/// A checked proposal: the card the user sees (<see cref="Title"/> + <see cref="Lines"/>) and the write that Confirm
/// runs through the module's own service, so every rule and check applies.
/// </summary>
public sealed record ActionPlan(string Title, IReadOnlyList<ActionLine> Lines, Func<Task<OperationResult<ActionDone>>> Write);

/// <summary>
/// One create or update the model may propose. Proposing only builds the <see cref="ActionPlan"/> (reads, never
/// writes); the write runs only when the user presses Confirm. There are no delete actions, by design.
/// </summary>
public sealed record AssistantAction(
    string Name,
    string? Module,
    string Description,
    object Parameters,
    Func<AssistantToolContext, ToolArgs, Task<ActionPlan>> Plan);

/// <summary>
/// The assistant's write actions (Session 95): create and update only — no delete, archive, "take back", vault or
/// account change exists here. Each action reads what it changes through the module's service, shows a card, and on
/// Confirm writes through the same service (and its validation), exactly as the module's own editor would.
/// </summary>
public static partial class AssistantActions
{
    public static IReadOnlyList<AssistantAction> Available(IReadOnlySet<string> hiddenModules) =>
        All.Where(a => a.Module is null || !hiddenModules.Contains(a.Module)).ToList();

    public static AssistantAction? Find(string name) => All.FirstOrDefault(a => a.Name == name);

    public static List<MistralTool> Definitions(IEnumerable<AssistantAction> actions) =>
        actions.Select(a => new MistralTool
        {
            Function = new MistralFunction { Name = a.Name, Description = a.Description, Parameters = a.Parameters },
        }).ToList();

    // ---- Schema helpers ----

    private static object Schema(string[] required, params (string Name, string Type, string Description, string[]? Values)[] properties) => new
    {
        type = "object",
        properties = properties.ToDictionary(
            p => p.Name,
            p => p.Type == "array"
                ? (object)new { type = "array", description = p.Description, items = new { type = "string" } }
                : p.Values is null
                    ? new { type = p.Type, description = p.Description }
                    : new { type = p.Type, description = p.Description, @enum = p.Values }),
        required,
    };

    private static (string, string, string, string[]?) P(string name, string type, string description, string[]? values = null) =>
        (name, type, description, values);

    private static readonly (string, string, string, string[]?) TagsArg =
        P("tags", "array", "Tag names (existing ones are reused, new ones created). On an update this replaces the tags.");

    private static readonly (string, string, string, string[]?) LifeAreaArg =
        P("lifeArea", "string", "The life area's name, e.g. Health, Career, Finance, Learning, Relationships.");

    // ---- Card helpers ----

    /// <summary>The card's lines: on a create every value given, on an update only what changes (with the old value).</summary>
    private sealed class Card(bool update)
    {
        public List<ActionLine> Lines { get; } = [];

        public void Add(string label, string? before, string? after)
        {
            if (!update)
            {
                if (!string.IsNullOrEmpty(after))
                {
                    Lines.Add(new ActionLine(label, after));
                }
            }
            else if (!string.Equals(before ?? string.Empty, after ?? string.Empty, StringComparison.Ordinal))
            {
                Lines.Add(new ActionLine(label, string.IsNullOrEmpty(after) ? "(none)" : after, string.IsNullOrEmpty(before) ? "(none)" : before));
            }
        }

        /// <summary>An update that would change nothing isn't worth a card.</summary>
        public void RequireChange()
        {
            if (update && Lines.Count == 0)
            {
                throw new ToolArgumentException("Nothing would change — those are already the current values. Ask the user what to change.");
            }
        }
    }

    private static string? Day(DateOnly? day) => day is { } d ? AssistantRules.Day(d) : null;

    private static string? Number(decimal? value) => value?.ToString("#,0.##", CultureInfo.InvariantCulture);

    private static string? Number(int? value) => value?.ToString("#,0", CultureInfo.InvariantCulture);

    private static string? Money(decimal? amount, string? currency) =>
        amount is { } a ? $"{currency} {a.ToString("#,0.00", CultureInfo.InvariantCulture)}".Trim() : null;

    private static string YesNo(bool value) => value ? "Yes" : "No";

    private static string? Trunc(string? text) => text is null ? null : AssistantRules.Clip(text, 300);

    // ---- Argument helpers ----

    /// <summary>On an update: the argument when sent (null clears), else the current value.</summary>
    private static string? Text(ToolArgs args, string name, string? current) => args.Has(name) ? args.String(name) : current;

    private static DateOnly? DateOr(ToolArgs args, string name, DateOnly? current) => args.Has(name) ? args.Date(name) : current;

    private static int? IntOr(ToolArgs args, string name, int? current) => args.Has(name) ? args.Int(name) : current;

    private static decimal? DecimalOr(ToolArgs args, string name, decimal? current) => args.Has(name) ? args.Decimal(name) : current;

    private static int Id(ToolArgs args, string name) =>
        args.Int(name) ?? throw new ToolArgumentException($"{name} is required — look the item up first to get its id.");

    private static string Required(ToolArgs args, string name) =>
        args.String(name) ?? throw new ToolArgumentException($"{name} is required.");

    /// <summary>One of the allowed words, any case; null when not sent.</summary>
    private static string? OneOf(ToolArgs args, string name, params string[] allowed)
    {
        var text = args.String(name);
        if (text is null)
        {
            return null;
        }

        return allowed.FirstOrDefault(a => string.Equals(a, text.Replace(" ", string.Empty), StringComparison.OrdinalIgnoreCase))
            ?? throw new ToolArgumentException($"{name} must be one of: {string.Join(", ", allowed)}.");
    }

    /// <summary>The request checked with its own data annotations, as the API's model validation would.</summary>
    private static T Valid<T>(T request) where T : class
    {
        var results = new List<ValidationResult>();
        return Validator.TryValidateObject(request, new ValidationContext(request), results, validateAllProperties: true)
            ? request
            : throw new ToolArgumentException(results[0].ErrorMessage ?? "Something in the request isn't valid.");
    }

    private static OperationResult<ActionDone> Done<T>(OperationResult<T> result, string kind, string entityType, Func<T, int> id, Func<T, string> title) =>
        result.Success
            ? OperationResult<ActionDone>.Ok(new ActionDone(kind, entityType, id(result.Data!), title(result.Data!)))
            : OperationResult<ActionDone>.Fail(result.Error!);

    private static OperationResult<T> Found<T>(OperationResult<T> result, string what) =>
        result.Success ? result : throw new ToolArgumentException($"There's no {what} with that id — look it up first.");

    // ---- Lookups by name ----

    /// <summary>A life area by name (any case); switched-off areas aren't offered.</summary>
    private static async Task<(int Id, string Name)?> LifeAreaAsync(AssistantToolContext ctx, string? name)
    {
        if (name is null)
        {
            return null;
        }

        var settings = await ctx.Get<ISettingsService>().GetAsync();
        var hidden = settings.Data?.HiddenLifeAreaIds ?? [];
        var areas = (await ctx.Get<ILifeAreasService>().GetAllAsync()).Where(a => !hidden.Contains(a.Id)).ToList();
        var area = areas.FirstOrDefault(a => string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase))
            ?? areas.FirstOrDefault(a => a.Name.StartsWith(name, StringComparison.OrdinalIgnoreCase));
        return area is null
            ? throw new ToolArgumentException($"There's no life area called {name}. The life areas are: {string.Join(", ", areas.Select(a => a.Name))}.")
            : (area.Id, area.Name);
    }

    private static async Task<string?> LifeAreaNameAsync(AssistantToolContext ctx, int? id)
    {
        if (id is null)
        {
            return null;
        }

        var areas = await ctx.Get<ILifeAreasService>().GetAllAsync();
        return areas.FirstOrDefault(a => a.Id == id)?.Name;
    }

    /// <summary>
    /// Tags by name for a card, and the ids to save: existing tags are reused (any case), new ones are created only
    /// when the write runs.
    /// </summary>
    private sealed class TagChoice(List<string> names, List<TagDto> existing)
    {
        public string Text => names.Count == 0
            ? string.Empty
            : string.Join(", ", names.Select(n => existing.Any(t => string.Equals(t.Name, n, StringComparison.OrdinalIgnoreCase)) ? n : $"{n} (new tag)"));

        public async Task<OperationResult<List<int>>> IdsAsync(ITagsService tags)
        {
            var ids = new List<int>();
            foreach (var name in names)
            {
                var found = existing.FirstOrDefault(t => string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase));
                if (found is null)
                {
                    var created = await tags.CreateAsync(name);
                    if (!created.Success)
                    {
                        // Someone else made it meanwhile (or it was refused): read again before giving up.
                        found = (await tags.GetAllAsync()).FirstOrDefault(t => string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase));
                        if (found is null)
                        {
                            return OperationResult<List<int>>.Fail(created.Error!);
                        }
                    }
                    else
                    {
                        found = created.Data!;
                    }
                }

                ids.Add(found.Id);
            }

            return OperationResult<List<int>>.Ok(ids);
        }
    }

    /// <summary>The tags sent, or null when the model didn't send any (an update then keeps the item's own).</summary>
    private static async Task<TagChoice?> TagsAsync(AssistantToolContext ctx, ToolArgs args)
    {
        var names = args.Strings("tags");
        if (names is null)
        {
            return null;
        }

        if (names.Any(n => n.Length > 50))
        {
            throw new ToolArgumentException("A tag name is at most 50 characters.");
        }

        return new TagChoice(names, await ctx.Get<ITagsService>().GetAllAsync());
    }

    private static string TagText(IEnumerable<TagDto> tags) => string.Join(", ", tags.Select(t => t.Name));

    /// <summary>Saves through <paramref name="write"/> with the chosen tags' ids (created first if new), or the current ones.</summary>
    private static async Task<OperationResult<ActionDone>> WithTagsAsync(
        AssistantToolContext ctx, TagChoice? choice, List<int> current, Func<List<int>, Task<OperationResult<ActionDone>>> write)
    {
        if (choice is null)
        {
            return await write(current);
        }

        var ids = await choice.IdsAsync(ctx.Get<ITagsService>());
        return ids.Success ? await write(ids.Data!) : OperationResult<ActionDone>.Fail(ids.Error!);
    }

    /// <summary>A weekday list ("Mon", "Tuesday", "weekdays", "weekends", "every day") as the habits bitmask (Mon = 1 … Sun = 64).</summary>
    internal static byte? WeekdayMask(IReadOnlyList<string>? days)
    {
        if (days is null)
        {
            return null;
        }

        byte mask = 0;
        foreach (var day in days)
        {
            var word = day.Trim().ToLowerInvariant();
            mask |= word switch
            {
                "every day" or "everyday" or "daily" or "all" => 127,
                "weekdays" => 31,
                "weekends" => 96,
                _ when word.Length >= 3 && "monday".StartsWith(word, StringComparison.Ordinal) => 1,
                _ when word.Length >= 3 && "tuesday".StartsWith(word, StringComparison.Ordinal) => 2,
                _ when word.Length >= 3 && "wednesday".StartsWith(word, StringComparison.Ordinal) => 4,
                _ when word.Length >= 3 && "thursday".StartsWith(word, StringComparison.Ordinal) => 8,
                _ when word.Length >= 3 && "friday".StartsWith(word, StringComparison.Ordinal) => 16,
                _ when word.Length >= 3 && "saturday".StartsWith(word, StringComparison.Ordinal) => 32,
                _ when word.Length >= 3 && "sunday".StartsWith(word, StringComparison.Ordinal) => 64,
                _ => throw new ToolArgumentException($"{day} isn't a day of the week."),
            };
        }

        return mask == 0 ? throw new ToolArgumentException("Pick at least one day of the week.") : mask;
    }

    /// <summary>The bitmask in words for a card ("Every day", "Weekdays", "Mon, Wed, Fri").</summary>
    internal static string WeekdayText(byte mask)
    {
        if (mask == 127)
        {
            return "Every day";
        }

        if (mask == 31)
        {
            return "Weekdays";
        }

        if (mask == 96)
        {
            return "Weekends";
        }

        string[] names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return string.Join(", ", names.Where((_, i) => (mask & (1 << i)) != 0));
    }

    /// <summary>A local moment for a card ("24/Oct/2026 13:00").</summary>
    private static string LocalText(DateTime utc, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone);
        return Invariant($"{AssistantRules.Day(DateOnly.FromDateTime(local))} {local:HH:mm}");
    }
}
