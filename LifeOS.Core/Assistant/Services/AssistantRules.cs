using System.Globalization;
using System.Text.Json;
using LifeOS.Core.Assistant.DTOs;
using static System.FormattableString;

namespace LifeOS.Core.Assistant.Services;

/// <summary>The four answers the topic check can give (AssistantRules.ParseTopic).</summary>
public enum ChatTopic
{
    /// <summary>The user's own LifeOS data.</summary>
    Data,
    /// <summary>How to use LifeOS.</summary>
    App,
    /// <summary>A greeting, thanks or a follow-up within the conversation.</summary>
    Chat,
    /// <summary>Anything else — refused with <see cref="AssistantRules.Refusal"/>, nothing of the user's data sent.</summary>
    Other,
}

/// <summary>The assistant's fixed rules: which models, what a key looks like, how long a chat may be, what's refused.</summary>
public static class AssistantRules
{
    public const string DefaultModel = "ministral-8b-2512";

    /// <summary>
    /// Mirrors CK_AssistantSettings_Model. Chosen for their higher free-tier rate limits (mistral-small-latest was
    /// rate-limited on the first question, 2026-10-23); pinned versions, so answers don't shift under a "-latest" alias.
    /// </summary>
    public static readonly IReadOnlyList<AssistantModelDto> Models =
    [
        new() { Id = "ministral-3b-2512", Label = "Ministral 3B — fastest, highest limits" },
        new() { Id = "ministral-8b-2512", Label = "Ministral 8B — fast, better answers (recommended)" },
        new() { Id = "codestral-2508", Label = "Codestral — Mistral's coding model" },
    ];

    /// <summary>The one reply to anything that isn't about LifeOS.</summary>
    public const string Refusal =
        "Sorry, I can only help with your LifeOS data and how to use LifeOS. Try asking about your goals, tasks, calendar, habits, money or anything else you keep here.";

    /// <summary>Messages kept from the conversation (the newest), and the most one message may hold.</summary>
    public const int MaxMessages = 20;
    public const int MaxMessageLength = 2000;

    /// <summary>Model calls per answer (tool rounds included) before giving up.</summary>
    public const int MaxRounds = 6;

    /// <summary>The most one lookup's result may add to what's sent.</summary>
    public const int MaxToolResultLength = 12_000;

    /// <summary>
    /// A pasted key, cleaned (spaces and a "Bearer " prefix taken off), or the reason it can't be one. The key is only
    /// checked with Mistral by "Test key".
    /// </summary>
    public static (string? Key, string? Error) CheckKey(string? pasted)
    {
        var key = (pasted ?? string.Empty).Trim();
        if (key.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            key = key["Bearer ".Length..].Trim();
        }

        if (key.Length == 0)
        {
            return (null, "Paste your Mistral API key.");
        }

        if (key.Any(c => char.IsWhiteSpace(c) || c < '!' || c > '~'))
        {
            return (null, "That doesn't look like a key — it has spaces or other characters a key doesn't. Copy it again from Mistral's console.");
        }

        return key.Length is < 20 or > 200
            ? (null, "That's too short or too long for a Mistral API key. Copy the whole key again from Mistral's console.")
            : (key, null);
    }

    public static string Last4(string key) => key.Length <= 4 ? key : key[^4..];

    /// <summary>A conversation the assistant will take: something to answer, the user's last, none too long.</summary>
    public static string? CheckConversation(IReadOnlyList<ChatMessageDto> messages)
    {
        if (messages.Count == 0 || messages[^1].Role != ChatRoles.User)
        {
            return "Type a question first.";
        }

        if (string.IsNullOrWhiteSpace(messages[^1].Content))
        {
            return "Type a question first.";
        }

        return messages.Any(m => m.Content.Length > MaxMessageLength)
            ? Invariant($"Keep each message under {MaxMessageLength} characters.")
            : null;
    }

    /// <summary>The newest messages that fit, starting with a user message.</summary>
    public static List<ChatMessageDto> Recent(IReadOnlyList<ChatMessageDto> messages)
    {
        var recent = messages.Skip(Math.Max(0, messages.Count - MaxMessages)).ToList();
        while (recent.Count > 1 && recent[0].Role != ChatRoles.User)
        {
            recent.RemoveAt(0);
        }

        return recent;
    }

    /// <summary>
    /// The topic check's verdict from its JSON answer (<c>{"topic":"data"}</c>). Anything unreadable counts as
    /// <see cref="ChatTopic.Other"/> — when in doubt, nothing is sent.
    /// </summary>
    public static ChatTopic ParseTopic(string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return ChatTopic.Other;
        }

        var text = answer.Trim();
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return ChatTopic.Other;
        }

        try
        {
            using var doc = JsonDocument.Parse(text[start..(end + 1)]);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("topic", out var topic)
                || topic.ValueKind != JsonValueKind.String)
            {
                return ChatTopic.Other;
            }

            return topic.GetString()?.Trim().ToLowerInvariant() switch
            {
                "data" => ChatTopic.Data,
                "app" => ChatTopic.App,
                "chat" => ChatTopic.Chat,
                _ => ChatTopic.Other,
            };
        }
        catch (JsonException)
        {
            return ChatTopic.Other;
        }
    }

    /// <summary>Whether a finished answer is the model's own refusal (the system prompt tells it to use the fixed text).</summary>
    public static bool IsRefusal(string? reply) =>
        reply is not null && reply.Contains("I can only help with your LifeOS data", StringComparison.OrdinalIgnoreCase);

    /// <summary>Text cut to <paramref name="max"/> characters, saying so.</summary>
    public static string Clip(string text, int max) =>
        text.Length <= max ? text : string.Concat(text.AsSpan(0, max), " …(cut short)");

    /// <summary>What a failed call to Mistral means for the user.</summary>
    public static string OutcomeMessage(MistralOutcome outcome, string? detail) => outcome switch
    {
        MistralOutcome.KeyRejected =>
            "Mistral didn't accept your API key — it may be mistyped, revoked or expired. Create a new key in Mistral's console and save it in Settings › AI assistant.",
        MistralOutcome.Busy =>
            $"Mistral's free tier is full for this model right now (Mistral says: \"{detail}\"). Try again in a minute, or choose another model in Settings › AI assistant.",
        MistralOutcome.RateLimited => detail is null
            ? "Mistral says you've hit your plan's limit for now. Wait a moment and try again (the free plan allows about one request a second and a monthly amount)."
            : $"Mistral says you've hit a limit for now (\"{detail}\"). Wait a moment and try again — the free plan allows about one request a second and a monthly amount.",
        MistralOutcome.Refused => detail is null
            ? "Mistral refused the request. Try another model in Settings › AI assistant."
            : $"Mistral refused the request: {detail}",
        _ => "Can't reach Mistral right now. Check your internet connection and try again.",
    };

    /// <summary>A day as the app writes it (14/Oct/2026), for the instructions.</summary>
    public static string Day(DateOnly day) => day.ToString("dd/MMM/yyyy", CultureInfo.InvariantCulture);
}
