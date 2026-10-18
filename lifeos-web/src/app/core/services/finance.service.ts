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
  /** In the base currency at the exchange-rate master's rate (null: no rate for its currency yet). */
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

/** A loan borrowed or lent; its instalment and what's owed are computed from the schedule. */
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
  termMonths: number;
  startDate: string;
  emiAmount: number | null;
  accountId: number | null;
  accountName: string | null;
  closedOn: string | null;
  notes: string | null;
  emi: number;
  outstanding: number;
  instalmentsPaid: number;
  instalmentCount: number;
  nextDueOn: string | null;
  lastDueOn: string | null;
  totalInterest: number;
}

export interface LoanInstalment {
  number: number;
  dueOn: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface LoanDetail {
  loan: Loan;
  schedule: LoanInstalment[];
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
  termMonths: number;
  startDate: string;
  emiAmount: number | null;
  accountId: number | null;
  closedOn: string | null;
  notes: string | null;
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

  removeLoan(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Loans/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
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
}
