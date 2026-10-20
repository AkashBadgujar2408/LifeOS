using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class LoanLedgerTests
{
    private static readonly DateOnly Start = new(2026, 1, 15);

    [Fact]
    public void An_emi_loan_paid_on_time_matches_its_schedule_to_the_paisa()
    {
        var schedule = LoanSchedule.Build(120_000m, 12m, 12, Start);
        var moves = schedule.Select(i => new LoanMove(i.Number, i.DueOn, -i.Payment)).ToList();

        foreach (var instalment in schedule)
        {
            var position = LoanLedger.At(120_000m, 12m, Start, null, instalment.DueOn, moves);
            Assert.Equal(instalment.Balance, position.Outstanding);
        }

        var last = LoanLedger.At(120_000m, 12m, Start, null, schedule[^1].DueOn, moves);
        Assert.Equal(schedule.Sum(i => i.Interest), last.InterestCharged);
        Assert.Equal(0, last.Outstanding);
    }

    [Fact]
    public void An_interest_free_pay_as_you_go_loan_owes_what_is_left()
    {
        // ₹50,000 from a friend, paid back 10,000 + 15,000 + 5,000 whenever.
        var moves = new[]
        {
            new LoanMove(1, new DateOnly(2026, 2, 3), -10_000m),
            new LoanMove(2, new DateOnly(2026, 5, 20), -15_000m),
            new LoanMove(3, new DateOnly(2026, 9, 1), -5_000m),
        };

        Assert.Equal(50_000m, LoanLedger.At(50_000m, 0m, Start, null, new DateOnly(2026, 2, 2), moves).Outstanding);
        Assert.Equal(25_000m, LoanLedger.At(50_000m, 0m, Start, null, new DateOnly(2026, 6, 1), moves).Outstanding);
        var now = LoanLedger.At(50_000m, 0m, Start, null, new DateOnly(2026, 10, 20), moves);
        Assert.Equal(20_000m, now.Outstanding);
        Assert.Equal(30_000m, now.Repaid);
        Assert.Equal(0, now.InterestCharged);
    }

    [Fact]
    public void A_payment_pays_interest_first_then_principal()
    {
        // 1,00,000 at 12% a year: 1,000 interest on 15 Feb; 3,000 paid on 20 Feb → 1,000 interest + 2,000 principal.
        var moves = new[] { new LoanMove(7, new DateOnly(2026, 2, 20), -3_000m) };
        var position = LoanLedger.At(100_000m, 12m, Start, null, new DateOnly(2026, 3, 1), moves);

        Assert.Equal(98_000m, position.PrincipalLeft);
        Assert.Equal(0, position.InterestDue);
        Assert.Equal(new LoanMoveSplit(7, 1_000m, 2_000m), Assert.Single(position.Splits));
        // On 15 Mar interest is charged on what's left: 980.
        Assert.Equal(98_980m, LoanLedger.At(100_000m, 12m, Start, null, new DateOnly(2026, 3, 15), moves).Outstanding);
    }

    [Fact]
    public void A_missed_instalment_leaves_an_emi_loan_behind_its_schedule()
    {
        var schedule = LoanSchedule.Build(120_000m, 12m, 12, Start);
        // Paid the first two of three instalments due by 15 Apr.
        var moves = schedule.Take(2).Select(i => new LoanMove(i.Number, i.DueOn, -i.Payment)).ToList();
        var day = new DateOnly(2026, 4, 15);

        var actual = LoanLedger.At(120_000m, 12m, Start, null, day, moves).Outstanding;
        var planned = LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, day);

        // Behind by the missed instalment's principal plus its interest (still owed).
        Assert.Equal(schedule[2].Payment, actual - planned);
    }

    [Fact]
    public void Instalments_taken_as_paid_start_from_the_schedule_and_only_later_payments_count()
    {
        var schedule = LoanSchedule.Build(120_000m, 12m, 12, Start);
        var assumed = new DateOnly(2026, 6, 1); // instalments of 15 Feb … 15 May taken as paid
        var moves = new[]
        {
            new LoanMove(1, new DateOnly(2026, 5, 15), -99_999m), // on or before the day: already counted, ignored
            new LoanMove(2, schedule[4].DueOn, -schedule[4].Payment),
        };

        Assert.Equal(schedule[3].Balance, LoanLedger.At(120_000m, 12m, Start, null, assumed, moves, schedule, assumed).Outstanding);
        Assert.Equal(schedule[4].Balance, LoanLedger.At(120_000m, 12m, Start, null, schedule[4].DueOn, moves, schedule, assumed).Outstanding);
    }

    [Fact]
    public void Overpaying_clears_it_drawing_more_adds_and_closing_ends_it()
    {
        Assert.Equal(0, LoanLedger.At(10_000m, 0m, Start, null, new DateOnly(2026, 3, 1),
            [new LoanMove(1, new DateOnly(2026, 2, 1), -12_000m)]).Outstanding);
        Assert.Equal(15_000m, LoanLedger.At(10_000m, 0m, Start, null, new DateOnly(2026, 3, 1),
            [new LoanMove(1, new DateOnly(2026, 2, 1), 5_000m)]).Outstanding);
        Assert.Equal(0, LoanLedger.At(10_000m, 0m, Start, new DateOnly(2026, 2, 1), new DateOnly(2026, 3, 1), []).Outstanding);
        Assert.Equal(0, LoanLedger.At(10_000m, 0m, Start, null, new DateOnly(2026, 1, 1), []).Outstanding);
    }

    [Fact]
    public void Transactions_count_as_moves_by_direction_and_currency()
    {
        // Borrowed: an expense repays, an income draws more; lent: the other way round. Transfers repay.
        Assert.Equal(-500m, LoanLedger.MoveOf(false, "Expense", false, 500m, "INR", null, null, "INR"));
        Assert.Equal(500m, LoanLedger.MoveOf(false, "Income", false, 500m, "INR", null, null, "INR"));
        Assert.Equal(-500m, LoanLedger.MoveOf(true, "Income", false, 500m, "INR", null, null, "INR"));
        Assert.Equal(-500m, LoanLedger.MoveOf(true, "Transfer", false, 6m, "USD", 500m, "INR", "INR"));
        // The start's own transaction is the principal; another currency doesn't count.
        Assert.Null(LoanLedger.MoveOf(false, "Income", true, 500m, "INR", null, null, "INR"));
        Assert.Null(LoanLedger.MoveOf(false, "Expense", false, 6m, "USD", null, null, "INR"));
    }

    [Fact]
    public void Emi_and_flexible_loans_are_checked_differently()
    {
        var today = new DateOnly(2026, 10, 20);
        string? Check(string kind, int? months, decimal? emi = null, DateOnly? assumed = null, decimal rate = 0m) =>
            WealthRules.CheckLoan("Personal", "Borrowed", "INR", 50_000m, rate, kind, months, Start, emi, assumed, null, today);

        Assert.Null(Check("Flexible", null));
        Assert.Null(Check("Flexible", 12)); // the term is ignored, not stored
        Assert.Null(Check("Emi", 12));
        Assert.NotNull(Check("Emi", null));
        Assert.NotNull(Check("Emi", 12, assumed: new DateOnly(2025, 1, 1)));
        Assert.NotNull(Check("Emi", 12, assumed: today.AddDays(1)));
        Assert.NotNull(Check("Monthly", 12));
        Assert.NotNull(WealthRules.CheckLoanPayment(new DateOnly(2026, 1, 1), 100m, Start, null, today));
        Assert.NotNull(WealthRules.CheckLoanPayment(today.AddDays(1), 100m, Start, null, today));
        Assert.NotNull(WealthRules.CheckLoanPayment(today, 0m, Start, null, today));
        Assert.Null(WealthRules.CheckLoanPayment(today, 100m, Start, null, today));
    }
}
