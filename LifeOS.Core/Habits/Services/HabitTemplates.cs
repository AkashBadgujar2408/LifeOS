using LifeOS.Core.Habits.DTOs;

namespace LifeOS.Core.Habits.Services;

/// <summary>
/// The habit library: ready-made habits to start from. Fixed in code (not user data); the category becomes a tag on
/// the habit and the life area is matched by name. Keys are stable identifiers — never rename one.
/// </summary>
public static class HabitTemplates
{
    private const byte EveryDay = HabitStreaks.EveryDay;
    private const byte Weekdays = 31;
    private const byte MonWedFri = 21;

    public static readonly IReadOnlyList<HabitTemplateDto> All =
    [
        Build("walk", "Health", "Walk", "A walk outside, any pace.", "Health", EveryDay, 30, "minutes"),
        Build("water", "Health", "Drink water", "Glasses through the day.", "Health", EveryDay, 8, "glasses"),
        Build("workout", "Health", "Work out", "Strength, cardio or a class.", "Health", MonWedFri),
        Build("sleep-by-11", "Health", "In bed by 11", "Screens off, lights out.", "Health", EveryDay),
        Build("read", "Learning", "Read", "Books, not feeds.", "Learning", EveryDay, 20, "pages"),
        Build("language", "Learning", "Practise a language", "Lessons, flashcards or a conversation.", "Learning", EveryDay, 15, "minutes"),
        Build("meditate", "Mind", "Meditate", "Sit, breathe, notice.", "Health", EveryDay, 10, "minutes"),
        Build("journal", "Mind", "Write in the journal", "A few lines about the day.", "Personal / Fun", EveryDay),
        Build("plan-day", "Productivity", "Plan tomorrow", "Pick the three things that matter.", "Career", Weekdays),
        Build("deep-work", "Productivity", "Deep work", "Focused time on the important thing.", "Career", Weekdays, 90, "minutes"),
        Build("call-family", "Relationships", "Call family", "A real conversation, not a text.", "Relationships", 64),
        Build("track-spending", "Money", "Log spending", "Note what went out today.", "Finance", EveryDay),
        Avoid("no-smoking", "Breaking habits", "No smoking", "Every smoke-free day counts.", "Health"),
        Avoid("no-alcohol", "Breaking habits", "No alcohol", "Clean days, one at a time.", "Health"),
        Avoid("no-phone-in-bed", "Breaking habits", "No phone in bed", "Leave it charging outside the bedroom.", "Health"),
        Avoid("no-junk-food", "Breaking habits", "No junk food", "Real meals instead.", "Health"),
        Avoid("no-impulse-buys", "Breaking habits", "No impulse buys", "Wait a day before buying anything not planned.", "Finance"),
    ];

    private static HabitTemplateDto Build(string key, string category, string title, string description, string lifeArea,
        byte scheduleDays, decimal? target = null, string? unit = null) =>
        new(key, category, title, description, HabitKinds.Build, target, unit, scheduleDays, lifeArea);

    private static HabitTemplateDto Avoid(string key, string category, string title, string description, string lifeArea) =>
        new(key, category, title, description, HabitKinds.Avoid, null, null, EveryDay, lifeArea);
}
