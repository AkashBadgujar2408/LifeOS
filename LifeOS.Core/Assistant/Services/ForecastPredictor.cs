using System.Text.Json;
using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.ServiceContracts;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Finance.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Assistant.Services;

/// <summary>
/// The Forecast tab on the user's own Mistral key (Session 96a). The facts come from Finance's own code — today's
/// balances and the money already known to be coming from <see cref="IForecastService"/>, past income/spending from the
/// ledger (<see cref="ITransactionsService.GetLedgerAsync"/>, money written by a still-running repeating transaction
/// left out since it's already scheduled ahead). Mistral only names the patterns; <see cref="ForecastPredictionRules"/>
/// checks them against the history and does every sum. An unusable answer is asked for once more, then refused. The
/// result is saved per horizon (<c>assistant.ForecastPredictions</c>, rewritten in place) and shown until Predict
/// again. The formula forecast stays behind My Day's low-balance insight.
/// </summary>
public class ForecastPredictor(
    AppDbContext db, IMistralClient mistral, ISettingsService settingsService, IForecastService forecastService,
    ITransactionsService transactionsService, IRecurringTransactionsService recurringService) : IForecastPredictor
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<ForecastPredictionDto?> GetSavedAsync(int months)
    {
        var row = await db.ForecastPredictions.AsNoTracking().FirstOrDefaultAsync(p => p.Months == months);
        if (row is null)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ForecastPredictionDto>(row.Payload, Json);
        }
        catch (JsonException)
        {
            // An older shape: as good as none — Predict again replaces it.
            return null;
        }
    }

    public async Task<OperationResult<ForecastPredictionDto>> PredictAsync(DateOnly today, int months, CancellationToken cancellationToken)
    {
        var settingsRow = await db.AssistantSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (settingsRow?.ApiKeySecret is null)
        {
            return OperationResult<ForecastPredictionDto>.Fail("Add your Mistral API key in Settings › AI assistant to predict the forecast.");
        }

        if (!settingsRow.IsEnabled)
        {
            return OperationResult<ForecastPredictionDto>.Fail("The assistant is switched off — switch it on in Settings › AI assistant to predict the forecast.");
        }

        var settings = await settingsService.GetAsync();
        if (settings.Data?.HiddenModules.Contains(ModuleKeys.Finance) ?? false)
        {
            return OperationResult<ForecastPredictionDto>.Fail("Finance is switched off in Settings › Modules.");
        }

        var known = await forecastService.GetAsync(today, months);
        if (known is null)
        {
            return OperationResult<ForecastPredictionDto>.Fail("Choose your base currency in Settings first — the forecast adds everything up in it.");
        }

        var lines = ForecastPredictionRules.Lines(known);
        var past = await PastMoneyAsync(today, known.BaseCurrency, lines);
        var history = ForecastPredictionRules.Months(today, past);
        var groups = ForecastPredictionRules.Groups(past, history, known.Items);
        var instructions = ForecastPredictionRules.Instructions(months);
        var input = ForecastPredictionRules.Input(today, months, known.BaseCurrency, history, groups, known.Items);
        var sent = new List<SentItemDto>
        {
            new() { Label = "Forecaster — instructions", Content = instructions },
            new() { Label = "Forecaster — your money", Content = input },
        };
        var messages = new List<MistralMessage>
        {
            new() { Role = "system", Content = instructions },
            new() { Role = "user", Content = input },
        };

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var answer = await mistral.ChatAsync(settingsRow.ApiKeySecret, new MistralChatRequest
            {
                Model = settingsRow.Model,
                Messages = messages,
                Temperature = attempt == 0 ? 0.2 : 0,
                MaxTokens = 1800,
                ResponseFormat = new MistralResponseFormat(),
            }, cancellationToken);
            if (!answer.IsOk)
            {
                return OperationResult<ForecastPredictionDto>.Fail(AssistantRules.OutcomeMessage(answer.Outcome, answer.Detail));
            }

            var content = answer.Value!.Content;
            var (parsed, problem) = ForecastPredictionRules.Parse(content, groups, history);
            if (parsed is not null)
            {
                var patterns = parsed.Patterns;
                var marks = ForecastPredictionRules.Marks(today, months);
                var names = lines.ToDictionary(l => l.Id, l => l);
                var prediction = new ForecastPredictionDto
                {
                    Months = months,
                    From = today,
                    Until = known.Until,
                    PredictedAt = DateTime.UtcNow,
                    BaseCurrency = known.BaseCurrency,
                    Model = settingsRow.Model,
                    Overall = ForecastPredictionRules.Project(lines[0], known.BaseCurrency, marks, known.Items, patterns, today),
                    Accounts = lines.Skip(1).Select(l => ForecastPredictionRules.Project(l, known.BaseCurrency, marks, known.Items, patterns, today)).ToList(),
                    Patterns = patterns.Select(p => new MoneyPatternDto
                    {
                        Name = p.Name,
                        Kind = p.Kind,
                        AccountId = names.GetValueOrDefault(p.LineId)?.AccountId,
                        LineName = names.GetValueOrDefault(p.LineId)?.Name ?? lines[0].Name,
                        Typical = p.Typical,
                        Low = p.Low,
                        High = p.High,
                        Confidence = p.Confidence,
                        Basis = p.Basis,
                        From = p.From.ToList(),
                    }).ToList(),
                    Confidence = parsed.Confidence,
                    ConfidenceReason = parsed.ConfidenceReason,
                    Summary = parsed.Summary,
                    HistoryFrom = history.Starts.Count > 0 ? history.Starts[0] : null,
                    HistoryTo = history.Starts.Count > 0 ? history.Starts[^1] : null,
                    Items = known.Items,
                    Unconverted = known.Unconverted,
                    Sent = sent,
                };
                await SaveAsync(months, today, prediction);
                return OperationResult<ForecastPredictionDto>.Ok(prediction);
            }

            // One more try, told what was wrong — that note is sent too, so it's shown.
            var retry = ForecastPredictionRules.Retry(problem!);
            messages.Add(new MistralMessage { Role = "assistant", Content = content ?? string.Empty });
            messages.Add(new MistralMessage { Role = "user", Content = retry });
            sent.Add(new SentItemDto { Label = "Forecaster — its first try (sent back)", Content = content ?? string.Empty });
            sent.Add(new SentItemDto { Label = "Forecaster — asked again", Content = retry });
        }

        return OperationResult<ForecastPredictionDto>.Fail(ForecastPredictionRules.Unusable);
    }

    /// <summary>
    /// Income and expenses of the last months in the base currency (others through the rate master / typed rates;
    /// without a rate they're left out), named by role, side income, payee or first tag. Money a still-running
    /// repeating transaction wrote is left out — its future is already in the known money.
    /// </summary>
    private async Task<List<PastMoney>> PastMoneyAsync(DateOnly today, string baseCurrency, IReadOnlyList<PredictionLine> lines)
    {
        var from = new DateOnly(today.Year, today.Month, 1).AddMonths(-ForecastPredictionRules.HistoryMonthsBack);
        var ledger = await transactionsService.GetLedgerAsync(from, today, null, null, null);
        var running = (await recurringService.GetAllAsync())
            .Where(r => !r.IsPaused && (r.Until is null || r.Until >= today))
            .Select(r => r.Id).ToHashSet();
        var master = await FinanceRates.MasterAsync(db, baseCurrency);
        var typed = await FinanceRates.TypedAsync(db);
        var past = new List<PastMoney>();
        foreach (var t in ledger.Transactions)
        {
            if (t.Kind is not (TransactionKinds.Income or TransactionKinds.Expense)
                || (t.RecurringTransactionId is { } schedule && running.Contains(schedule)))
            {
                continue;
            }

            var rate = t.Currency == baseCurrency ? 1m : NetWorth.RateFor(t.Currency, t.OccurredOn, master, typed);
            if (rate is null)
            {
                continue;
            }

            var income = t.Kind == TransactionKinds.Income;
            var accountId = income ? t.ToAccountId : t.FromAccountId;
            var line = lines.FirstOrDefault(l => l.AccountId == accountId && l.Currency == t.Currency)?.Id ?? "all";
            var group = income && t.EmploymentTitle is { Length: > 0 } role ? $"Pay — {role}"
                : income && t.SideIncomeName is { Length: > 0 } side ? $"Side income — {side}"
                : t.Payee is { Length: > 0 } payee ? payee
                : t.Tags.FirstOrDefault() is { } tag ? $"#{tag.Name}"
                : income ? "Other income" : "Other spending";
            past.Add(new PastMoney(t.OccurredOn, income ? ForecastPredictionRules.Income : ForecastPredictionRules.Expense, group, line,
                Math.Round(t.Amount * rate.Value, 2, MidpointRounding.AwayFromZero)));
        }

        return past;
    }

    private async Task SaveAsync(int months, DateOnly today, ForecastPredictionDto prediction)
    {
        var payload = JsonSerializer.Serialize(prediction, Json);
        var row = await db.ForecastPredictions.FirstOrDefaultAsync(p => p.Months == months);
        if (row is null)
        {
            db.ForecastPredictions.Add(new ForecastPrediction
            {
                UserId = db.CurrentUserId!.Value,
                Months = months,
                PredictedOn = today,
                Payload = payload,
            });
        }
        else
        {
            row.PredictedOn = today;
            row.Payload = payload;
            row.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
    }
}
