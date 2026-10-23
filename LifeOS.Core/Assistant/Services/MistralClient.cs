using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LifeOS.Core.Assistant.Services;

/// <summary>How a call to Mistral went, in the terms the user is told about.</summary>
public enum MistralOutcome
{
    Ok,
    /// <summary>401/403 — the key is wrong, revoked or expired.</summary>
    KeyRejected,
    /// <summary>429 even after one wait — the plan's rate or monthly limit.</summary>
    RateLimited,
    /// <summary>No answer, a timeout or a 5xx.</summary>
    Unreachable,
    /// <summary>Mistral refused the request itself (another 4xx).</summary>
    Refused,
}

public record MistralResult<T>(MistralOutcome Outcome, T? Value, string? Detail = null)
{
    public bool IsOk => Outcome == MistralOutcome.Ok;
}

/// <summary>
/// The Mistral chat API over plain HTTP (no SDK — Mistral publishes none for .NET, and the API is three JSON shapes).
/// Every call carries the user's own key; the key is never logged (the Authorization header is redacted).
/// </summary>
public interface IMistralClient
{
    Task<MistralResult<MistralMessage>> ChatAsync(string apiKey, MistralChatRequest request, CancellationToken cancellationToken);

    /// <summary>Lists models — a free call that only works with a valid key.</summary>
    Task<MistralResult<bool>> CheckKeyAsync(string apiKey, CancellationToken cancellationToken);
}

public class MistralClient(HttpClient http) : IMistralClient
{
    public const string BaseAddress = "https://api.mistral.ai/v1/";

    /// <summary>The free plan allows about one request a second; a 429 is waited out once before giving up.</summary>
    private static readonly TimeSpan RetryAfterDefault = TimeSpan.FromMilliseconds(1500);
    private static readonly TimeSpan RetryAfterMax = TimeSpan.FromSeconds(5);

    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<MistralResult<MistralMessage>> ChatAsync(string apiKey, MistralChatRequest request, CancellationToken cancellationToken)
    {
        var result = await SendAsync(apiKey, () => new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = JsonContent.Create(request, options: Json),
        }, cancellationToken);
        if (!result.IsOk)
        {
            return new MistralResult<MistralMessage>(result.Outcome, null, result.Detail);
        }

        try
        {
            var response = JsonSerializer.Deserialize<MistralChatResponse>(result.Value!, Json);
            var message = response?.Choices?.FirstOrDefault()?.Message;
            return message is null
                ? new MistralResult<MistralMessage>(MistralOutcome.Unreachable, null, "Mistral sent back no answer.")
                : new MistralResult<MistralMessage>(MistralOutcome.Ok, message.ToMessage());
        }
        catch (JsonException)
        {
            return new MistralResult<MistralMessage>(MistralOutcome.Unreachable, null, "Mistral's answer couldn't be read.");
        }
    }

    public async Task<MistralResult<bool>> CheckKeyAsync(string apiKey, CancellationToken cancellationToken)
    {
        var result = await SendAsync(apiKey, () => new HttpRequestMessage(HttpMethod.Get, "models"), cancellationToken);
        return new MistralResult<bool>(result.Outcome, result.IsOk, result.Detail);
    }

    private async Task<MistralResult<string>> SendAsync(string apiKey, Func<HttpRequestMessage> build, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            using var request = build();
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            HttpResponseMessage response;
            try
            {
                response = await http.SendAsync(request, cancellationToken);
            }
            catch (HttpRequestException)
            {
                return new MistralResult<string>(MistralOutcome.Unreachable, null);
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return new MistralResult<string>(MistralOutcome.Unreachable, null);
            }

            using (response)
            {
                if (response.IsSuccessStatusCode)
                {
                    return new MistralResult<string>(MistralOutcome.Ok, await response.Content.ReadAsStringAsync(cancellationToken));
                }

                if (response.StatusCode == HttpStatusCode.TooManyRequests && attempt == 1)
                {
                    var wait = response.Headers.RetryAfter?.Delta ?? RetryAfterDefault;
                    await Task.Delay(wait < RetryAfterMax ? wait : RetryAfterMax, cancellationToken);
                    continue;
                }

                return response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new MistralResult<string>(MistralOutcome.KeyRejected, null),
                    HttpStatusCode.TooManyRequests => new MistralResult<string>(MistralOutcome.RateLimited, null),
                    >= HttpStatusCode.InternalServerError => new MistralResult<string>(MistralOutcome.Unreachable, null),
                    _ => new MistralResult<string>(MistralOutcome.Refused, null, await ErrorDetailAsync(response, cancellationToken)),
                };
            }
        }
    }

    /// <summary>Mistral's own words for a refused request (e.g. a model the plan doesn't include), kept short.</summary>
    private static async Task<string?> ErrorDetailAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var message = doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String
                ? m.GetString()
                : null;
            return message is null ? null : AssistantRules.Clip(message, 200);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

// ---- Wire shapes (snake_case through MistralClient.Json) -------------------------------------------------------

public class MistralChatRequest
{
    public string Model { get; init; } = string.Empty;
    public List<MistralMessage> Messages { get; init; } = [];
    public List<MistralTool>? Tools { get; init; }
    public string? ToolChoice { get; init; }
    public double? Temperature { get; init; }
    public int? MaxTokens { get; init; }
    public MistralResponseFormat? ResponseFormat { get; init; }
}

public class MistralResponseFormat
{
    public string Type { get; init; } = "json_object";
}

public class MistralMessage
{
    public string Role { get; init; } = string.Empty;
    public string? Content { get; init; }
    public List<MistralToolCall>? ToolCalls { get; init; }
    public string? ToolCallId { get; init; }
    public string? Name { get; init; }
}

public class MistralToolCall
{
    public string Id { get; init; } = string.Empty;
    public string Type { get; init; } = "function";
    public MistralFunctionCall Function { get; init; } = new();
}

public class MistralFunctionCall
{
    public string Name { get; init; } = string.Empty;
    /// <summary>The arguments as a JSON text.</summary>
    public string Arguments { get; init; } = "{}";
}

public class MistralTool
{
    public string Type { get; init; } = "function";
    public MistralFunction Function { get; init; } = new();
}

public class MistralFunction
{
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public object Parameters { get; init; } = new();
}

/// <summary>A response is read loosely: content may be text or a list of chunks, arguments text or an object.</summary>
internal class MistralChatResponse
{
    public List<MistralChoice>? Choices { get; init; }
}

internal class MistralChoice
{
    public MistralResponseMessage? Message { get; init; }
}

internal class MistralResponseMessage
{
    public string? Role { get; init; }
    public JsonElement Content { get; init; }
    public List<MistralResponseToolCall>? ToolCalls { get; init; }

    public MistralMessage ToMessage() => new()
    {
        Role = Role ?? "assistant",
        Content = ContentText(Content),
        ToolCalls = ToolCalls is { Count: > 0 }
            ? ToolCalls.Select(c => new MistralToolCall
            {
                Id = c.Id ?? string.Empty,
                Function = new MistralFunctionCall
                {
                    Name = c.Function?.Name ?? string.Empty,
                    Arguments = c.Function?.Arguments.ValueKind switch
                    {
                        JsonValueKind.String => c.Function.Arguments.GetString() ?? "{}",
                        JsonValueKind.Object => c.Function.Arguments.GetRawText(),
                        _ => "{}",
                    },
                },
            }).ToList()
            : null,
    };

    private static string? ContentText(JsonElement content) => content.ValueKind switch
    {
        JsonValueKind.String => content.GetString(),
        JsonValueKind.Array => string.Concat(content.EnumerateArray()
            .Where(chunk => chunk.ValueKind == JsonValueKind.Object
                && chunk.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
            .Select(chunk => chunk.GetProperty("text").GetString())),
        _ => null,
    };
}

internal class MistralResponseToolCall
{
    public string? Id { get; init; }
    public MistralResponseFunction? Function { get; init; }
}

internal class MistralResponseFunction
{
    public string? Name { get; init; }
    public JsonElement Arguments { get; init; }
}
