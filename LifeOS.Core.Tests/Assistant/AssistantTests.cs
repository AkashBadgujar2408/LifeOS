using System.Net;
using System.Text;
using System.Text.Json;
using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Tests.Assistant;

public class AssistantTests
{
    [Fact]
    public void A_pasted_key_is_cleaned_or_refused_in_plain_words()
    {
        Assert.Equal("AbCdEfGh1234567890IjKlMnOpQrStUv", AssistantRules.CheckKey("  AbCdEfGh1234567890IjKlMnOpQrStUv \n").Key);
        Assert.Equal("AbCdEfGh1234567890IjKlMnOpQrStUv", AssistantRules.CheckKey("Bearer AbCdEfGh1234567890IjKlMnOpQrStUv").Key);
        Assert.Equal("Paste your Mistral API key.", AssistantRules.CheckKey("   ").Error);
        Assert.Contains("spaces", AssistantRules.CheckKey("AbCdEfGh 1234567890IjKlMnOpQrStUv").Error);
        Assert.Contains("32 letters", AssistantRules.CheckKey("short").Error);
        Assert.Equal("StUv", AssistantRules.Last4("AbCdEfGh1234567890IjKlMnOpQrStUv"));
    }

    [Fact]
    public void A_conversation_needs_a_question_last_and_keeps_only_the_newest_messages()
    {
        static ChatMessageDto M(string role, string text) => new() { Role = role, Content = text };

        Assert.Equal("Type a question first.", AssistantRules.CheckConversation([]));
        Assert.Equal("Type a question first.", AssistantRules.CheckConversation([M(ChatRoles.User, "hi"), M(ChatRoles.Assistant, "hello")]));
        Assert.Equal("Type a question first.", AssistantRules.CheckConversation([M(ChatRoles.User, "  ")]));
        Assert.NotNull(AssistantRules.CheckConversation([M(ChatRoles.User, new string('x', AssistantRules.MaxMessageLength + 1))]));
        Assert.Null(AssistantRules.CheckConversation([M(ChatRoles.User, "What's due today?")]));

        // 25 messages, alternating from the user: the newest 20 start with an assistant one, which is dropped too.
        var long25 = Enumerable.Range(0, 25).Select(i => M(i % 2 == 0 ? ChatRoles.User : ChatRoles.Assistant, $"m{i}")).ToList();
        var recent = AssistantRules.Recent(long25);
        Assert.Equal(19, recent.Count);
        Assert.Equal(ChatRoles.User, recent[0].Role);
        Assert.Equal("m24", recent[^1].Content);
    }

    [Theory]
    [InlineData("{\"topic\":\"data\"}", ChatTopic.Data)]
    [InlineData(" {\"topic\": \"APP\"} ", ChatTopic.App)]
    [InlineData("Sure! {\"topic\":\"chat\"}", ChatTopic.Chat)]
    [InlineData("{\"topic\":\"other\"}", ChatTopic.Other)]
    [InlineData("{\"topic\":\"poetry\"}", ChatTopic.Other)]
    [InlineData("{\"topic\":3}", ChatTopic.Other)]
    [InlineData("data", ChatTopic.Other)]
    [InlineData("{broken", ChatTopic.Other)]
    [InlineData(null, ChatTopic.Other)]
    public void The_topic_check_refuses_whatever_it_cannot_read(string? answer, ChatTopic expected) =>
        Assert.Equal(expected, AssistantRules.ParseTopic(answer));

    [Fact]
    public void The_models_own_refusal_is_recognised_and_long_text_is_cut_short()
    {
        Assert.True(AssistantRules.IsRefusal(AssistantRules.Refusal));
        Assert.False(AssistantRules.IsRefusal("You have 3 tasks due today."));
        Assert.Equal("abc", AssistantRules.Clip("abc", 5));
        Assert.Equal("abcde …(cut short)", AssistantRules.Clip("abcdefgh", 5));
    }

    [Fact]
    public void Switched_off_modules_and_a_locked_vault_take_their_lookups_away()
    {
        var all = AssistantTools.Available(new HashSet<string>(), healthUnlocked: true).Select(t => t.Name).ToList();
        Assert.Contains("health_report", all);
        Assert.Contains("transactions", all);

        var locked = AssistantTools.Available(new HashSet<string>(), healthUnlocked: false).Select(t => t.Name).ToList();
        Assert.DoesNotContain("health_report", locked);

        var noMoney = AssistantTools.Available(new HashSet<string> { ModuleKeys.Finance, ModuleKeys.Health }, healthUnlocked: true)
            .Select(t => t.Name).ToList();
        Assert.DoesNotContain("transactions", noMoney);
        Assert.DoesNotContain("accounts", noMoney);
        Assert.DoesNotContain("health_report", noMoney);
        Assert.Contains("report", noMoney);
        Assert.Equal(ModuleKeys.Finance, AssistantTools.ReportModule("money"));
        Assert.Null(AssistantTools.ReportModule("life_balance"));

        // Names are unique — the model calls them by name.
        Assert.Equal(AssistantTools.All.Count, AssistantTools.All.Select(t => t.Name).Distinct().Count());
    }

    [Fact]
    public void Lookup_arguments_are_read_loosely_and_checked()
    {
        var args = ToolArgs.Parse("{\"from\":\"2026-10-01\",\"goal_id\":\"7\",\"view\":\" overdue \"}");
        Assert.Equal(new DateOnly(2026, 10, 1), args.Date("from"));
        Assert.Equal(7, args.Int("goal_id"));
        Assert.Equal("overdue", args.String("view"));
        Assert.Null(args.String("missing"));
        Assert.Equal((new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 7)), args.Range(new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 7), 62));

        Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("{\"from\":\"01/10/2026\"}").Date("from"));
        Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("{\"from\":\"2026-10-09\",\"to\":\"2026-10-01\"}")
            .Range(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 1), 62));
        Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("{\"from\":\"2026-01-01\",\"to\":\"2026-12-31\"}")
            .Range(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 1), 62));
        Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("not json"));
        Assert.Null(ToolArgs.Parse("").Int("goal_id"));
    }

    [Fact]
    public void Moments_go_to_the_model_in_the_users_local_time()
    {
        var kolkata = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        var json = JsonSerializer.Serialize(
            new { startsAt = new DateTime(2026, 10, 22, 19, 0, 0, DateTimeKind.Utc), endsAt = (DateTime?)null, day = new DateOnly(2026, 10, 23) },
            AssistantTools.ResultJson(kolkata));
        Assert.Equal("{\"startsAt\":\"2026-10-23 00:30\",\"day\":\"2026-10-23\"}", json);
    }

    [Fact]
    public async Task Mistral_answers_are_read_in_either_shape_and_failures_named()
    {
        // Content as chunks, arguments as an object.
        var client = Client(new Queue<HttpResponseMessage>([Json(HttpStatusCode.OK,
            """{"choices":[{"message":{"role":"assistant","content":[{"type":"text","text":"Hello "},{"type":"text","text":"there"}],"tool_calls":[{"id":"a1","function":{"name":"tasks","arguments":{"view":"today"}}}]}}]}""")]));
        var result = await client.ChatAsync("key", new MistralChatRequest { Model = "m" }, CancellationToken.None);
        Assert.True(result.IsOk);
        Assert.Equal("Hello there", result.Value!.Content);
        Assert.Equal("tasks", result.Value.ToolCalls![0].Function.Name);
        Assert.Equal("{\"view\":\"today\"}", result.Value.ToolCalls[0].Function.Arguments);

        Assert.Equal(MistralOutcome.KeyRejected,
            (await Client(new Queue<HttpResponseMessage>([Json(HttpStatusCode.Unauthorized, "{}")])).CheckKeyAsync("bad", CancellationToken.None)).Outcome);
        Assert.Equal(MistralOutcome.Unreachable,
            (await Client(new Queue<HttpResponseMessage>([Json(HttpStatusCode.BadGateway, "")])).CheckKeyAsync("k", CancellationToken.None)).Outcome);

        var refused = await Client(new Queue<HttpResponseMessage>([Json(HttpStatusCode.BadRequest, """{"message":"Invalid model"}""")]))
            .ChatAsync("k", new MistralChatRequest { Model = "m" }, CancellationToken.None);
        Assert.Equal(MistralOutcome.Refused, refused.Outcome);
        Assert.Equal("Mistral refused the request: Invalid model", AssistantRules.OutcomeMessage(refused.Outcome, refused.Detail));

        // A 429 is waited out once (Retry-After 0 s here), then it works.
        var limited = Json(HttpStatusCode.TooManyRequests, "{}");
        limited.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.Zero);
        var retried = await Client(new Queue<HttpResponseMessage>([limited, Json(HttpStatusCode.OK, "{}")])).CheckKeyAsync("k", CancellationToken.None);
        Assert.True(retried.IsOk);
    }

    private static MistralClient Client(Queue<HttpResponseMessage> responses) =>
        new(new HttpClient(new QueueHandler(responses)) { BaseAddress = new Uri(MistralClient.BaseAddress) });

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class QueueHandler(Queue<HttpResponseMessage> responses) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            return Task.FromResult(responses.Dequeue());
        }
    }
}
