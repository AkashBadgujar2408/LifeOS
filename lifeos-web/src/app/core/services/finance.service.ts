import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { todayIso } from '../dates/today';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';
import { RecurrenceFrequency } from './tasks.service';

export const ACCOUNT_KINDS = ['Bank', 'Cash', 'Wallet', 'Card'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const TRANSACTION_KINDS = ['Expense', 'Income', 'Transfer'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Where money sits; its balance is computed for the end of today, never stored. */
export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  institution: string | null;
  numberLast4: string | null;
  currency: string;
  openingBalance: number;
  openingDate: string;
  isArchived: boolean;
  notes: string | null;
  balance: number;
  transactionCount: number;
  lastOn: string | null;
  /** The whole account in the base currency at the rate master's rates (null: a currency holding money has no rate yet). */
  balanceInBase: number | null;
  /** Every currency it holds with its balance, the main one first (one entry for a single-currency account). */
  balances: AccountCurrencyBalance[];
}

export interface AccountCurrencyBalance {
  currency: string;
  openingBalance: number;
  balance: number;
  balanceInBase: number | null;
}

export interface AccountPayload {
  name: string;
  kind: AccountKind;
  institution: string | null;
  /** Whatever was typed; only the last 4 letters/digits are kept. */
  number: string | null;
  currency: string;
  openingBalance: number;
  openingDate: string;
  isArchived: boolean;
  notes: string | null;
  /** The other currencies a multi-currency account holds (PayPal, Wise), with their opening balances; replaced whole. */
  extraCurrencies: { currency: string; openingBalance: number }[];
}

/**
 * One movement of money. The amount is in `currency`, the moving account's (From for an expense or transfer, To
 * for income); a cross-currency transfer also has what arrived (`toAmount`, in `toCurrency`).
 */
export interface Transaction {
  id: number;
  kind: TransactionKind;
  occurredOn: string;
  amount: number;
  currency: string;
  /** Base-currency units per 1 `currency`; null when it is the base currency. */
  exchangeRate: number | null;
  toAmount: number | null;
  fromAccountId: number | null;
  fromAccountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  toCurrency: string | null;
  payee: string | null;
  note: string | null;
  reference: string | null;
  employmentId: number | null;
  employmentTitle: string | null;
  sideIncomeSourceId: number | null;
  sideIncomeName: string | null;
  recurringTransactionId: number | null;
  recurringName: string | null;
  tags: Tag[];
}

export interface TransactionPayload {
  kind: TransactionKind;
  occurredOn: string;
  amount: number;
  exchangeRate: number | null;
  toAmount: number | null;
  fromAccountId: number | null;
  toAccountId: number | null;
  payee: string | null;
  note: string | null;
  reference: string | null;
  employmentId: number | null;
  sideIncomeSourceId: number | null;
  /** On a multi-currency account: the currency it moved in (null = the account's main one). */
  currency: string | null;
  /** A transfer into a multi-currency account: the currency that arrived (null = as it left, if held). */
  toCurrency: string | null;
  /** Replaces the transaction's tags as a whole. */
  tagIds: number[];
}

export interface LedgerTotals {
  /** The base currency; null when none is chosen yet. */
  currency: string | null;
  income: number;
  spending: number;
  net: number;
  /** Incomes/expenses in another currency with no rate, left out of the totals. */
  unconverted: number;
}

export interface Ledger {
  transactions: Transaction[];
  totals: LedgerTotals;
}

export interface LedgerFilter {
  from: string | null;
  to: string | null;
  accountId: number | null;
  tagId: number | null;
  kind: TransactionKind | null;
}

/** A repeating transaction; it writes into the ledger when due (from `startDate`, every N units). */
export interface RecurringTransaction {
  id: number;
  name: string;
  kind: TransactionKind;
  amount: number;
  currency: string;
  exchangeRate: number | null;
  toAmount: number | null;
  fromAccountId: number | null;
  fromAccountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  toCurrency: string | null;
  payee: string | null;
  note: string | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  startDate: string;
  until: string | null;
  /** The last day already written (null: nothing yet). */
  generatedThrough: string | null;
  isPaused: boolean;
  /** The next day it will write (null: paused or finished). */
  nextOn: string | null;
  generatedCount: number;
  tags: Tag[];
}

export interface RecurringTransactionPayload {
  name: string;
  kind: TransactionKind;
  amount: number;
  exchangeRate: number | null;
  toAmount: number | null;
  currency: string | null;
  toCurrency: string | null;
  fromAccountId: number | null;
  toAccountId: number | null;
  payee: string | null;
  note: string | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  startDate: string;
  until: string | null;
  isPaused: boolean;
  tagIds: number[];
  today: string;
}

export interface BudgetLine {
  tagId: number;
  tagName: string;
  budget: number | null;
  budgetCurrency: string | null;
  spent: number;
  transactionCount: number;
  unconverted: number;
  /** Budget − spent (negative when over); null without a comparable budget. */
  remaining: number | null;
  percentUsed: number | null;
  isOver: boolean;
}

/** A month's budgets against spending, and its totals, in the base currency. */
export interface MonthSummary {
  monthStart: string;
  currency: string | null;
  income: number;
  spending: number;
  untaggedSpending: number;
  unconverted: number;
  lines: BudgetLine[];
}

export const HOLDING_KINDS = [
  'Stock',
  'MutualFund',
  'Gold',
  'PPF',
  'FD',
  'Bond',
  'Crypto',
  'Property',
  'Other',
] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

export interface HoldingValuation {
  id: number;
  valuedOn: string;
  value: number;
  note: string | null;
}

/** An investment; its worth is the latest valuation, else what was put in (null once sold/matured). */
export interface Holding {
  id: number;
  name: string;
  kind: HoldingKind;
  currency: string;
  units: number | null;
  investedAmount: number | null;
  interestRate: number | null;
  acquiredOn: string | null;
  maturesOn: string | null;
  disposedOn: string | null;
  accountId: number | null;
  accountName: string | null;
  notes: string | null;
  currentValue: number | null;
  gain: number | null;
  /** Newest first. */
  valuations: HoldingValuation[];
}

export interface HoldingPayload {
  name: string;
  kind: HoldingKind;
  currency: string;
  units: number | null;
  investedAmount: number | null;
  interestRate: number | null;
  acquiredOn: string | null;
  maturesOn: string | null;
  disposedOn: string | null;
  accountId: number | null;
  notes: string | null;
  today: string;
}

export const LOAN_KINDS = [
  'Home',
  'Vehicle',
  'Personal',
  'Education',
  'Gold',
  'CreditCard',
  'Other',
] as const;
export type LoanKind = (typeof LOAN_KINDS)[number];
export type LoanDirection = 'Borrowed' | 'Lent';

export type LoanRepaymentKind = 'Emi' | 'Flexible';

/**
 * A loan borrowed or lent, repaid by EMI or as you go. What's owed comes from the payments actually recorded (each a
 * transaction tied to the loan); an EMI loan also has its schedule.
 */
export interface Loan {
  id: number;
  name: string;
  kind: LoanKind;
  direction: LoanDirection;
  counterparty: string | null;
  contactId: number | null;
  contactName: string | null;
  principal: number;
  currency: string;
  annualRate: number;
  repaymentKind: LoanRepaymentKind;
  /** EMI only. */
  termMonths: number | null;
  startDate: string;
  emiAmount: number | null;
  /** EMI only: instalments due on or before this day count as paid. */
  assumedPaidThrough: string | null;
  accountId: number | null;
  accountName: string | null;
  closedOn: string | null;
  notes: string | null;
  /** The transaction recording the money at the start (null: not in Finance). */
  disbursementTransactionId: number | null;
  disbursementAccountName: string | null;
  outstanding: number;
  interestDue: number;
  interestCharged: number;
  repaid: number;
  paymentCount: number;
  lastPaidOn: string | null;
  // EMI loans only (null for a flexible loan):
  emi: number | null;
  scheduledOutstanding: number | null;
  /** Outstanding − scheduled: > 0 behind, < 0 ahead. */
  behind: number | null;
  instalmentsDue: number | null;
  instalmentCount: number | null;
  nextDueOn: string | null;
  lastDueOn: string | null;
  totalInterest: number | null;
}

export interface LoanInstalment {
  number: number;
  dueOn: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** A repayment (a transaction tied to the loan) and how it split: interest first, then principal. */
export interface LoanPayment {
  transactionId: number;
  paidOn: string;
  amount: number;
  interest: number;
  principal: number;
  accountName: string | null;
  note: string | null;
  /** On or before "paid up to" — already counted by the schedule. */
  coveredBySchedule: boolean;
}

export interface LoanDetail {
  loan: Loan;
  /** EMI loans only. */
  schedule: LoanInstalment[];
  /** Newest first. */
  payments: LoanPayment[];
}

export interface LoanMoneyPayload {
  accountId: number;
  exchangeRate: number | null;
  tagIds: number[];
}

export interface LoanPaymentPayload extends LoanMoneyPayload {
  paidOn: string;
  amount: number;
  note: string | null;
  today: string;
}

export interface LoanPayload {
  name: string;
  kind: LoanKind;
  direction: LoanDirection;
  counterparty: string | null;
  contactId: number | null;
  principal: number;
  currency: string;
  annualRate: number;
  repaymentKind: LoanRepaymentKind;
  termMonths: number | null;
  startDate: string;
  emiAmount: number | null;
  assumedPaidThrough: string | null;
  accountId: number | null;
  closedOn: string | null;
  notes: string | null;
  /** On create only: record the money at the start in Finance. */
  disbursement: LoanMoneyPayload | null;
  today: string;
}

export type WealthItemType = 'FinanceAccount' | 'Holding' | 'Loan';

/** One thing in net worth: positive = an asset, negative = owed; `inBase` null = no rate, not counted. */
export interface WealthItem {
  type: WealthItemType;
  id: number;
  name: string;
  currency: string;
  amount: number;
  inBase: number | null;
}

export interface NetWorthPoint {
  day: string;
  assets: number;
  liabilities: number;
  net: number;
}

export interface NetWorth {
  currency: string | null;
  day: string;
  assets: number;
  liabilities: number;
  net: number;
  items: WealthItem[];
  /** Month ends, oldest first, then today. */
  history: NetWorthPoint[];
}

export interface SavingsProgress {
  targetAmount: number;
  targetCurrency: string;
  saved: number;
  percent: number;
  /** The linked accounts/investments; `inBase` is what counted, in the goal's currency (null: not comparable). */
  items: WealthItem[];
}

/** "1 Currency = rate BaseCurrency from effectiveOn", set by hand in Settings. */
export interface ExchangeRate {
  id: number;
  currency: string;
  baseCurrency: string;
  rate: number;
  effectiveOn: string;
}

export const POLICY_KINDS = ['Health', 'Life', 'Vehicle', 'Home', 'Travel', 'Other'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const PREMIUM_FREQUENCIES = [
  'Monthly',
  'Quarterly',
  'HalfYearly',
  'Yearly',
  'Single',
] as const;
export type PremiumFrequency = (typeof PREMIUM_FREQUENCIES)[number];

/** An insurance policy; its renewal reminder is kept in step by the server. */
export interface InsurancePolicy {
  id: number;
  name: string;
  kind: PolicyKind;
  insurer: string | null;
  policyNumberLast4: string | null;
  currency: string;
  sumAssured: number | null;
  premium: number | null;
  premiumFrequency: PremiumFrequency | null;
  startDate: string | null;
  renewsOn: string | null;
  endsOn: string | null;
  contactId: number | null;
  contactName: string | null;
  notes: string | null;
  renewalReminderDays: number | null;
  /** The premium over a year (null: none, or paid once). */
  annualPremium: number | null;
}

export interface InsurancePolicyPayload {
  name: string;
  kind: PolicyKind;
  insurer: string | null;
  /** Whatever was typed; only the last 4 letters/digits are kept. */
  number: string | null;
  currency: string;
  sumAssured: number | null;
  premium: number | null;
  premiumFrequency: PremiumFrequency | null;
  startDate: string | null;
  renewsOn: string | null;
  endsOn: string | null;
  contactId: number | null;
  notes: string | null;
  renewalReminderDays: number | null;
  timeZone: string;
}

export const TAX_ITEM_KINDS = ['Deadline', 'Deduction', 'Payment', 'Document', 'Other'] as const;
export type TaxItemKind = (typeof TAX_ITEM_KINDS)[number];

/** Something for the taxman, filed under the user's own tax-year label; its due day shows on the calendar. */
export interface TaxItem {
  id: number;
  title: string;
  kind: TaxItemKind;
  taxYear: string | null;
  dueOn: string | null;
  amount: number | null;
  currency: string | null;
  isDeductible: boolean;
  transactionId: number | null;
  transactionOn: string | null;
  transactionPayee: string | null;
  transactionAmount: number | null;
  transactionCurrency: string | null;
  doneOn: string | null;
  notes: string | null;
}

export interface TaxItemPayload {
  title: string;
  kind: TaxItemKind;
  taxYear: string | null;
  dueOn: string | null;
  /** Null with a transaction = take the transaction's amount. */
  amount: number | null;
  currency: string | null;
  isDeductible: boolean;
  transactionId: number | null;
  doneOn: string | null;
  notes: string | null;
  today: string;
}

/** One bank-statement line as read from the CSV: + money in, − money out. */
export interface ImportLine {
  occurredOn: string;
  amount: number;
  description: string | null;
  reference: string | null;
}

export type ImportLineStatus = 'New' | 'Duplicate' | 'Error';

export interface ImportResult {
  /** Written (0 for a preview, or when any line has an error — all or nothing). */
  added: number;
  new: number;
  duplicates: number;
  errors: number;
  lines: { index: number; status: ImportLineStatus; error: string | null }[];
}

export interface CashFlowMonth {
  monthStart: string;
  income: number;
  spending: number;
  net: number;
  /** % of income kept, one decimal; null without income. */
  savingsRate: number | null;
  unconverted: number;
}

export interface CashFlowReport {
  /** The base currency (null: none chosen — the report is empty). */
  currency: string | null;
  months: CashFlowMonth[];
  total: CashFlowMonth;
  tags: { tagId: number; tagName: string; spent: number; transactionCount: number }[];
  untaggedSpending: number;
}

// ---- Cash-flow forecast (Session 71a) ----

export type ForecastSource =
  | 'Repeating'
  | 'Bill'
  | 'ExpectedBill'
  | 'Loan'
  | 'Subscription'
  | 'Insurance'
  | 'Tax'
  | 'Cashback';

export interface ForecastPoint {
  day: string;
  /** At the end of the day, after its money. */
  balance: number;
}

export interface ForecastLine {
  /** Null for the overall line (all accounts, in the base currency). */
  accountId: number | null;
  name: string;
  currency: string;
  start: number;
  end: number;
  lowest: ForecastPoint;
  /** Today, each day money moves, and the last day. */
  points: ForecastPoint[];
}

export interface ForecastItem {
  day: string;
  source: ForecastSource;
  title: string;
  /** Null: not tied to an account yet — it counts in the overall line only. */
  accountId: number | null;
  accountName: string | null;
  /** In (+) or out (−), in its own currency. */
  amount: number;
  currency: string;
  amountInBase: number | null;
  /** Worked out from a pattern (expected bills). */
  isEstimate: boolean;
}

export interface Forecast {
  from: string;
  until: string;
  baseCurrency: string;
  overall: ForecastLine;
  accounts: ForecastLine[];
  items: ForecastItem[];
  unconverted: string[];
}

// ---- Savings & retirement projections (Session 71b) ----

export type SavingsPlanStatus = 'Reached' | 'OnTrack' | 'Behind' | 'NoDate' | 'Overdue';

export interface PlanAssumptions {
  expectedReturnPercent: number;
  inflationPercent: number;
  /** Typed only when Health has no date of birth. */
  birthDate: string | null;
  retirementAge: number;
  yearsInRetirement: number;
  /** Per month in retirement, in today's money. */
  monthlySpending: number | null;
  /** Typed to override the last three months' actual saving. */
  monthlySaving: number | null;
  /** False until saved: these are the defaults. */
  isSaved: boolean;
}

export interface SavingsGoalPlan {
  goalId: number;
  title: string;
  targetAmount: number;
  currency: string;
  saved: number;
  percent: number;
  targetDate: string | null;
  monthsLeft: number;
  neededPerMonth: number;
  actualPerMonth: number;
  status: SavingsPlanStatus;
}

export interface RetirementPoint {
  age: number;
  projected: number;
  needed: number;
}

export interface RetirementProjection {
  yearsToRetirement: number;
  monthlySpendingAtRetirement: number;
  corpusNeeded: number;
  ruleOf25: number;
  projectedCorpus: number;
  /** The first age the projection covers what's needed then (null: not by 100). */
  ageReached: number | null;
  points: RetirementPoint[];
}

export interface FinancialPlan {
  baseCurrency: string | null;
  assumptions: PlanAssumptions;
  age: number | null;
  ageFromHealth: boolean;
  investments: number;
  monthlySavingActual: number | null;
  monthlySavingUsed: number;
  goals: SavingsGoalPlan[];
  retirement: RetirementProjection | null;
  missing: string[];
}

export type PlanAssumptionsPayload = Omit<PlanAssumptions, 'isSaved'> & { today: string };

/** The Finance API: accounts with computed balances, the ledger, repeating transactions and budgets. */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Finance';

  /** Today's run of the repeating transactions, shared by every Finance read until the day (or a schedule) changes. */
  private written: { day: string; run: Observable<number> } | null = null;

  /**
   * Writes the repeating transactions due by today before anything is read, so balances, the ledger and budgets
   * include them. Once per day per session (again after a schedule changes); a failure doesn't block the read.
   */
  private dueWritten(): Observable<number> {
    const day = todayIso();
    if (this.written?.day !== day) {
      this.written = {
        day,
        run: this.http
          .post<ApiResponse<number>>(`${this.base}/RecurringTransactions/generate`, { today: day })
          .pipe(
            map((response) => response.data ?? 0),
            catchError(() => {
              this.written = null;
              return of(0);
            }),
            shareReplay(1),
          ),
      };
    }
    return this.written.run;
  }

  // ---- Accounts ----

  accounts(): Observable<Account[]> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<Account[]>>(`${this.base}/Accounts`, {
          params: { today: todayIso() },
        }),
      ),
      map((response) => response.data ?? []),
    );
  }

  saveAccount(id: number | null, payload: AccountPayload): Observable<Account> {
    const params = { today: todayIso() };
    const request = id
      ? this.http.put<ApiResponse<Account>>(`${this.base}/Accounts/${id}`, payload, { params })
      : this.http.post<ApiResponse<Account>>(`${this.base}/Accounts`, payload, { params });
    return request.pipe(map((response) => response.data!));
  }

  removeAccount(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Accounts/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Transactions ----

  ledger(filter: LedgerFilter): Observable<Ledger> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.dueWritten().pipe(
      switchMap(() => this.http.get<ApiResponse<Ledger>>(`${this.base}/Transactions`, { params })),
      map((response) => response.data!),
    );
  }

  transaction(id: number): Observable<Transaction> {
    return this.http
      .get<ApiResponse<Transaction>>(`${this.base}/Transactions/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveTransaction(id: number | null, payload: TransactionPayload): Observable<Transaction> {
    const request = id
      ? this.http.put<ApiResponse<Transaction>>(`${this.base}/Transactions/${id}`, payload)
      : this.http.post<ApiResponse<Transaction>>(`${this.base}/Transactions`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeTransaction(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Transactions/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Repeating transactions ----

  recurring(): Observable<RecurringTransaction[]> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<RecurringTransaction[]>>(`${this.base}/RecurringTransactions`),
      ),
      map((response) => response.data ?? []),
    );
  }

  saveRecurring(
    id: number | null,
    payload: RecurringTransactionPayload,
  ): Observable<RecurringTransaction> {
    const request = id
      ? this.http.put<ApiResponse<RecurringTransaction>>(
          `${this.base}/RecurringTransactions/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<RecurringTransaction>>(
          `${this.base}/RecurringTransactions`,
          payload,
        );
    // The next read writes whatever the new or changed schedule has due.
    return request.pipe(
      tap(() => (this.written = null)),
      map((response) => response.data!),
    );
  }

  removeRecurring(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/RecurringTransactions/${id}`)
      .pipe(map(() => undefined));
  }

  // ---- Budgets ----

  /** A month (its first day, "yyyy-MM-01"): budgets per tag against spending, and the month's totals. */
  month(monthStart: string): Observable<MonthSummary> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<MonthSummary>>(`${this.base}/Budgets/${monthStart}`),
      ),
      map((response) => response.data!),
    );
  }

  /** Sets a tag's budget for the month; null removes it. Returns the month as it now stands. */
  setBudget(monthStart: string, tagId: number, amount: number | null): Observable<MonthSummary> {
    return this.http
      .put<ApiResponse<MonthSummary>>(`${this.base}/Budgets/${monthStart}/${tagId}`, { amount })
      .pipe(map((response) => response.data!));
  }

  copyPreviousBudgets(monthStart: string): Observable<MonthSummary> {
    return this.http
      .post<ApiResponse<MonthSummary>>(`${this.base}/Budgets/${monthStart}/copy`, {})
      .pipe(map((response) => response.data!));
  }

  // ---- Investments ----

  holdings(): Observable<Holding[]> {
    return this.http
      .get<ApiResponse<Holding[]>>(`${this.base}/Holdings`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data ?? []));
  }

  saveHolding(id: number | null, payload: HoldingPayload): Observable<Holding> {
    const request = id
      ? this.http.put<ApiResponse<Holding>>(`${this.base}/Holdings/${id}`, payload)
      : this.http.post<ApiResponse<Holding>>(`${this.base}/Holdings`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeHolding(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Holdings/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  /** What it was worth on a day (replaces that day's); returns the holding as it now stands. */
  setValuation(
    id: number,
    valuedOn: string,
    value: number,
    note: string | null,
  ): Observable<Holding> {
    return this.http
      .put<ApiResponse<Holding>>(`${this.base}/Holdings/${id}/valuations`, {
        valuedOn,
        value,
        note,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  removeValuation(id: number, valuationId: number): Observable<Holding> {
    return this.http
      .delete<ApiResponse<Holding>>(`${this.base}/Holdings/${id}/valuations/${valuationId}`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data!));
  }

  // ---- Loans ----

  loans(): Observable<Loan[]> {
    return this.http
      .get<ApiResponse<Loan[]>>(`${this.base}/Loans`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data ?? []));
  }

  loan(id: number): Observable<LoanDetail> {
    return this.http
      .get<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data!));
  }

  saveLoan(id: number | null, payload: LoanPayload): Observable<LoanDetail> {
    const request = id
      ? this.http.put<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}`, payload)
      : this.http.post<ApiResponse<LoanDetail>>(`${this.base}/Loans`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Records the money at the start as one transaction (once). */
  recordLoanStart(id: number, payload: LoanMoneyPayload): Observable<LoanDetail> {
    return this.http
      .put<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}/disbursement`, payload, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data!));
  }

  /** Deletes the start's transaction; the loan stays. */
  removeLoanStart(id: number): Observable<LoanDetail> {
    return this.http
      .delete<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}/disbursement`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data!));
  }

  /** A repayment: one transaction tied to the loan. */
  addLoanPayment(id: number, payload: LoanPaymentPayload): Observable<LoanDetail> {
    return this.http
      .post<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}/payments`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Deletes a repayment's transaction. */
  removeLoanPayment(id: number, transactionId: number): Observable<LoanDetail> {
    return this.http
      .delete<ApiResponse<LoanDetail>>(`${this.base}/Loans/${id}/payments/${transactionId}`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data!));
  }

  removeLoan(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Loans/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Cash-flow forecast ----

  /** Balances carried forward 3, 6 or 12 months with the money already known to be coming (never stored). */
  forecast(months: 3 | 6 | 12): Observable<Forecast> {
    return this.http
      .get<ApiResponse<Forecast>>(`${this.base}/Forecast`, {
        params: { today: todayIso(), months },
      })
      .pipe(map((response) => response.data!));
  }

  // ---- Savings & retirement projections ----

  plan(): Observable<FinancialPlan> {
    return this.http
      .get<ApiResponse<FinancialPlan>>(`${this.base}/Plan`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data!));
  }

  /** Every figure recomputes from the assumptions. */
  savePlanAssumptions(payload: PlanAssumptionsPayload): Observable<FinancialPlan> {
    return this.http
      .put<ApiResponse<FinancialPlan>>(`${this.base}/Plan/assumptions`, payload)
      .pipe(map((response) => response.data!));
  }

  // ---- Net worth + savings goals ----

  netWorth(): Observable<NetWorth> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<NetWorth>>(`${this.base}/NetWorth`, {
          params: { today: todayIso() },
        }),
      ),
      map((response) => response.data!),
    );
  }

  /** A savings goal's progress; null when the goal has no amount target. */
  savings(goalId: number): Observable<SavingsProgress | null> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<SavingsProgress | null>>(
          `${this.base}/NetWorth/savings/${goalId}`,
          { params: { today: todayIso() } },
        ),
      ),
      map((response) => response.data ?? null),
    );
  }

  // ---- Exchange-rate master ----

  /** The rates set against the current base currency, newest first per currency. */
  rates(): Observable<ExchangeRate[]> {
    return this.http
      .get<ApiResponse<ExchangeRate[]>>(`${this.base}/ExchangeRates`)
      .pipe(map((response) => response.data ?? []));
  }

  /** Sets a currency's rate from a day (replacing that day's); returns all rates as they now stand. */
  setRate(currency: string, rate: number, effectiveOn: string): Observable<ExchangeRate[]> {
    return this.http
      .put<ApiResponse<ExchangeRate[]>>(`${this.base}/ExchangeRates`, {
        currency,
        rate,
        effectiveOn,
        today: todayIso(),
      })
      .pipe(map((response) => response.data ?? []));
  }

  removeRate(id: number): Observable<ExchangeRate[]> {
    return this.http
      .delete<ApiResponse<ExchangeRate[]>>(`${this.base}/ExchangeRates/${id}`)
      .pipe(map((response) => response.data ?? []));
  }

  // ---- Insurance ----

  policies(): Observable<InsurancePolicy[]> {
    return this.http
      .get<ApiResponse<InsurancePolicy[]>>(`${this.base}/InsurancePolicies`)
      .pipe(map((response) => response.data ?? []));
  }

  policy(id: number): Observable<InsurancePolicy> {
    return this.http
      .get<ApiResponse<InsurancePolicy>>(`${this.base}/InsurancePolicies/${id}`)
      .pipe(map((response) => response.data!));
  }

  /** Saving moves (or removes) the renewal reminder, so reminder lists refresh. */
  savePolicy(id: number | null, payload: InsurancePolicyPayload): Observable<InsurancePolicy> {
    const request = id
      ? this.http.put<ApiResponse<InsurancePolicy>>(`${this.base}/InsurancePolicies/${id}`, payload)
      : this.http.post<ApiResponse<InsurancePolicy>>(`${this.base}/InsurancePolicies`, payload);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  removePolicy(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/InsurancePolicies/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Tax ----

  taxItems(): Observable<TaxItem[]> {
    return this.http
      .get<ApiResponse<TaxItem[]>>(`${this.base}/TaxItems`)
      .pipe(map((response) => response.data ?? []));
  }

  taxItem(id: number): Observable<TaxItem> {
    return this.http
      .get<ApiResponse<TaxItem>>(`${this.base}/TaxItems/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveTaxItem(id: number | null, payload: TaxItemPayload): Observable<TaxItem> {
    const request = id
      ? this.http.put<ApiResponse<TaxItem>>(`${this.base}/TaxItems/${id}`, payload)
      : this.http.post<ApiResponse<TaxItem>>(`${this.base}/TaxItems`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Marks it handled today, or reopens it. */
  setTaxItemDone(id: number, done: boolean): Observable<TaxItem> {
    const today = todayIso();
    return this.http
      .put<ApiResponse<TaxItem>>(`${this.base}/TaxItems/${id}/done`, {
        doneOn: done ? today : null,
        today,
      })
      .pipe(map((response) => response.data!));
  }

  removeTaxItem(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/TaxItems/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Statement import ----

  /** Which lines are new, already imported or wrong; writes nothing. */
  previewImport(
    accountId: number,
    lines: ImportLine[],
    tagIds: number[],
  ): Observable<ImportResult> {
    return this.http
      .post<ApiResponse<ImportResult>>(`${this.base}/Transactions/import/preview`, {
        accountId,
        lines,
        tagIds,
      })
      .pipe(map((response) => response.data!));
  }

  /** Writes the new lines — all or nothing; lines already imported are skipped. */
  importStatement(
    accountId: number,
    lines: ImportLine[],
    tagIds: number[],
  ): Observable<ImportResult> {
    return this.http
      .post<ApiResponse<ImportResult>>(`${this.base}/Transactions/import`, {
        accountId,
        lines,
        tagIds,
      })
      .pipe(map((response) => response.data!));
  }

  // ---- Reports ----

  /** The last `months` months up to this one, in the base currency. */
  cashFlow(months: number): Observable<CashFlowReport> {
    return this.dueWritten().pipe(
      switchMap(() =>
        this.http.get<ApiResponse<CashFlowReport>>(`${this.base}/Reports/cashflow`, {
          params: { today: todayIso(), months },
        }),
      ),
      map((response) => response.data!),
    );
  }
}
