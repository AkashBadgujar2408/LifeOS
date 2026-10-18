import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { todayIso } from '../dates/today';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

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

/** The Finance API: accounts with computed balances, and the ledger. */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Finance';

  // ---- Accounts ----

  accounts(): Observable<Account[]> {
    return this.http
      .get<ApiResponse<Account[]>>(`${this.base}/Accounts`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data ?? []));
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
    return this.http
      .get<ApiResponse<Ledger>>(`${this.base}/Transactions`, { params })
      .pipe(map((response) => response.data!));
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
}
