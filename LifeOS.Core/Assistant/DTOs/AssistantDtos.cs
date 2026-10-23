using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Assistant.DTOs;

/// <summary>
/// The assistant's settings as the browser sees them. The key itself never leaves the server — only whether one is
/// set, its last four characters and when it was added.
/// </summary>
public class AssistantSettingsDto
{
    public bool IsEnabled { get; init; }
    public string Model { get; init; } = string.Empty;
    public bool HasKey { get; init; }
    public string? KeyLast4 { get; init; }
    public DateTime? KeySetAt { get; init; }
    /// <summary>The Mistral models the assistant can use, cheapest first.</summary>
    public List<AssistantModelDto> Models { get; init; } = [];
}

public class AssistantModelDto
{
    public string Id { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
}

/// <summary>A Mistral API key, pasted from Mistral's console.</summary>
public class AssistantKeyRequest
{
    [Required(ErrorMessage = "Paste your Mistral API key.")]
    public string ApiKey { get; init; } = string.Empty;
}

public class AssistantPreferencesRequest
{
    public bool IsEnabled { get; init; }

    [Required(ErrorMessage = "Choose a model.")]
    public string Model { get; init; } = string.Empty;
}

/// <summary>What "Test key" found, in words for the user.</summary>
public class AssistantKeyTestDto
{
    public bool Works { get; init; }
    public string Message { get; init; } = string.Empty;
}

public static class ChatRoles
{
    public const string User = "user";
    public const string Assistant = "assistant";
}

/// <summary>
/// One turn of the chat. The browser keeps the conversation (nothing is stored on the server) and sends the visible
/// messages each time; the last one is the user's new message.
/// </summary>
public class ChatMessageDto
{
    [Required]
    [AllowedValues(ChatRoles.User, ChatRoles.Assistant, ErrorMessage = "A message is from the user or the assistant.")]
    public string Role { get; init; } = string.Empty;

    [Required]
    public string Content { get; init; } = string.Empty;
}

public class ChatRequest
{
    [Required]
    public List<ChatMessageDto> Messages { get; init; } = [];

    /// <summary>The user's local today — dates in answers ("this week", "overdue") are counted from it.</summary>
    [Required]
    public DateOnly Today { get; init; }

    /// <summary>The browser's IANA time zone, for anything that happens at a moment (calendar, focus, reports).</summary>
    public string? TimeZone { get; init; }
}

public class ChatReplyDto
{
    public string Reply { get; init; } = string.Empty;
    /// <summary>True when the question wasn't about LifeOS and got the fixed refusal.</summary>
    public bool Refused { get; init; }
    /// <summary>The LifeOS lookups the answer used, by their plain names.</summary>
    public List<string> Lookups { get; init; } = [];
    /// <summary>Everything sent to Mistral for this answer, in order.</summary>
    public List<SentItemDto> Sent { get; init; } = [];
}

/// <summary>One thing that went to Mistral: the instructions, a message, or what a lookup returned.</summary>
public class SentItemDto
{
    public string Label { get; init; } = string.Empty;
    public string Content { get; init; } = string.Empty;
}
