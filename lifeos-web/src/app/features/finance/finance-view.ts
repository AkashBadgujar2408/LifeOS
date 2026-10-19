import { daysBetween } from '../career/career-view';
import type {
  AccountKind,
  ExchangeRate,
  HoldingKind,
  InsurancePolicy,
  LoanKind,
  NetWorthPoint,
  PolicyKind,
  PremiumFrequency,
  TaxItem,
  TaxItemKind,
  Transaction,
  TransactionKind,
} from '../../core/services/finance.service';

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  Bank: 'Bank account',
  Cash: 'Cash',
  Wallet: 'Wallet',
  Card: 'Card',
};

export const ACCOUNT_KIND_ICONS: Record<AccountKind, string> = {
  Bank: 'bi-bank',
  Cash: 'bi-cash-coin',
  Wallet: 'bi-wallet2',
  Card: 'bi-credit-card',
};

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  Expense: 'Expense',
  Income: 'Income',
  Transfer: 'Transfer',
};

export const TRANSACTION_KIND_ICONS: Record<TransactionKind, string> = {
  Expense: 'bi-arrow-up-right',
  Income: 'bi-arrow-down-left',
  Transfer: 'bi-arrow-left-right',
};

/**
 * "₹1,250.50", "$10.00", "−₹400.00" — the currency's own decimals, a real minus sign. A code Intl doesn't know
 * still reads sensibly ("XYZ 12.50").
 */
export function formatMoney(amount: number, currency: string, locale = 'en-IN'): string {
  const sign = amount < 0 ? '−' : '';
  try {
    return (
      sign + new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Math.abs(amount))
    );
  } catch {
    return `${sign}${currency} ${Math.abs(amount).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

/**
 * What a transaction did to the money in view, signed: income in (+), an expense out (−). A transfer only has a
 * direction from one account's side — seen from `accountId` it's out of the From account (−, in its currency) and
 * into the To account (+, what arrived); with no account in view it's just moved (no sign, sign 0).
 */
export function signedAmount(
  t: Transaction,
  accountId: number | null,
): { amount: number; currency: string; sign: -1 | 0 | 1 } {
  if (t.kind === 'Income') {
    return { amount: t.amount, currency: t.currency, sign: 1 };
  }
  if (t.kind === 'Expense') {
    return { amount: -t.amount, currency: t.currency, sign: -1 };
  }
  if (accountId !== null && t.toAccountId === accountId) {
    return {
      amount: t.toAmount ?? t.amount,
      currency: t.toCurrency ?? t.currency,
      sign: 1,
    };
  }
  if (accountId !== null && t.fromAccountId === accountId) {
    return { amount: -t.amount, currency: t.currency, sign: -1 };
  }
  return { amount: t.amount, currency: t.currency, sign: 0 };
}

/** "+₹50,000.00" / "−₹400.00" / "₹3,000.00" for a moved transfer. */
export function signedMoney(t: Transaction, accountId: number | null): string {
  const { amount, currency, sign } = signedAmount(t, accountId);
  return (sign === 1 ? '+' : '') + formatMoney(amount, currency);
}

/** The account side of a row: "HDFC Savings", or "HDFC Savings → Cash" for a transfer. */
export function accountLine(t: Transaction): string {
  if (t.kind === 'Transfer') {
    return `${t.fromAccountName ?? '?'} → ${t.toAccountName ?? '?'}`;
  }
  return (t.kind === 'Income' ? t.toAccountName : t.fromAccountName) ?? '';
}

/** What to call a row: its payee, else its note, else what it was for, else its kind. */
export function transactionTitle(t: Transaction): string {
  return (
    t.payee ??
    t.note ??
    t.employmentTitle ??
    t.sideIncomeName ??
    (t.kind === 'Transfer' ? 'Transfer' : TRANSACTION_KIND_LABELS[t.kind])
  );
}

/** The first and last day of the month a "yyyy-MM-dd" day is in, on year/month numbers (never `Date`). */
export function monthRange(isoDay: string): { from: string; to: string } {
  const [year, month] = isoDay.split('-').map(Number);
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${days}` };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Balances added up per currency (accounts in different currencies aren't summed together). */
export function totalsByCurrency(
  accounts: { currency: string; balance: number }[],
): { currency: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + account.balance);
  }
  return [...totals]
    .map(([currency, total]) => ({ currency, total: Math.round(total * 10000) / 10000 }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "October 2026" for a month's first day ("2026-10-01"). */
export function monthLabel(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** The first day of the month `delta` months away, on year/month numbers (never `Date`). */
export function shiftMonth(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * How full a budget bar is drawn (0–100) and whether it's past the budget. Past 100% the bar is full and the
 * overspend is said in words — the bar never grows beyond its track.
 */
export function budgetBar(line: { percentUsed: number | null; isOver: boolean }): {
  width: number;
  over: boolean;
} {
  return { width: Math.min(100, Math.max(0, line.percentUsed ?? 0)), over: line.isOver };
}

export const HOLDING_KIND_LABELS: Record<HoldingKind, string> = {
  Stock: 'Shares',
  MutualFund: 'Mutual fund',
  Gold: 'Gold',
  PPF: 'PPF',
  FD: 'Fixed deposit',
  Bond: 'Bond',
  Crypto: 'Crypto',
  Property: 'Property',
  Other: 'Other',
};

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  Home: 'Home loan',
  Vehicle: 'Vehicle loan',
  Personal: 'Personal loan',
  Education: 'Education loan',
  Gold: 'Gold loan',
  CreditCard: 'Card loan',
  Other: 'Other',
};

/**
 * Net worth's move over the history in words: "Up ₹12,400.00 since 31/Oct/2025" style parts — the change from the
 * oldest point to the latest (null with fewer than two points).
 */
export function netWorthChange(history: NetWorthPoint[]): { change: number; since: string } | null {
  if (history.length < 2) {
    return null;
  }
  const first = history[0];
  const last = history[history.length - 1];
  return { change: Math.round((last.net - first.net) * 100) / 100, since: first.day };
}

/** "3 of 240 paid" share of a loan's instalments, as a whole % (0 when it has none). */
export function loanPaidPercent(paid: number, count: number): number {
  return count === 0 ? 0 : Math.floor((paid * 100) / count);
}

/** The rate the master gives a currency on a day: the latest set on or before it (null: none). */
export function rateOn(rates: ExchangeRate[], currency: string, day: string): number | null {
  const set = rates
    .filter((r) => r.currency === currency && r.effectiveOn <= day)
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
  return set.length ? set[set.length - 1].rate : null;
}

/** Each currency's rate in force on a day, with the history behind it (newest first), currencies A–Z. */
export function currentRates(
  rates: ExchangeRate[],
  day: string,
): { currency: string; current: ExchangeRate | null; history: ExchangeRate[] }[] {
  const currencies = [...new Set(rates.map((r) => r.currency))].sort();
  return currencies.map((currency) => {
    const history = rates
      .filter((r) => r.currency === currency)
      .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn));
    return { currency, current: history.find((r) => r.effectiveOn <= day) ?? null, history };
  });
}

/**
 * Open accounts added up in the base currency (their converted balances), naming the ones with no rate yet. Null
 * when every account is already in the base currency — the per-currency total says it all then.
 */
export function baseTotal(
  accounts: { name: string; currency: string; balanceInBase: number | null }[],
  baseCurrency: string | null,
): { currency: string; total: number; missing: string[] } | null {
  if (!baseCurrency || accounts.every((a) => a.currency === baseCurrency)) {
    return null;
  }
  const total = accounts.reduce((sum, a) => sum + (a.balanceInBase ?? 0), 0);
  return {
    currency: baseCurrency,
    total: Math.round(total * 10000) / 10000,
    missing: accounts.filter((a) => a.balanceInBase === null).map((a) => a.name),
  };
}

export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  Health: 'Health',
  Life: 'Life',
  Vehicle: 'Vehicle',
  Home: 'Home',
  Travel: 'Travel',
  Other: 'Other',
};

export const POLICY_KIND_ICONS: Record<PolicyKind, string> = {
  Health: 'bi-heart-pulse',
  Life: 'bi-shield-check',
  Vehicle: 'bi-car-front',
  Home: 'bi-house',
  Travel: 'bi-airplane',
  Other: 'bi-shield',
};

export const PREMIUM_FREQUENCY_LABELS: Record<PremiumFrequency, string> = {
  Monthly: 'a month',
  Quarterly: 'a quarter',
  HalfYearly: 'every six months',
  Yearly: 'a year',
  Single: 'once (single premium)',
};

export const TAX_ITEM_KIND_LABELS: Record<TaxItemKind, string> = {
  Deadline: 'Deadline',
  Deduction: 'Deduction',
  Payment: 'Tax paid',
  Document: 'Form to collect',
  Other: 'Other',
};

/** How soon a renewal counts as "soon" on the insurance page (the reminder itself is set per policy). */
export const RENEWAL_SOON_DAYS = 30;

/**
 * Where a policy stands today: ended (past its end day), renewal overdue (the renewal day has gone by — renewed
 * policies get a new date), renews soon (within 30 days), or in force.
 */
export function policyStatus(
  policy: Pick<InsurancePolicy, 'renewsOn' | 'endsOn'>,
  today: string,
): { kind: 'ended' | 'overdue' | 'soon' | 'active'; days: number | null } {
  if (policy.endsOn && policy.endsOn < today) {
    return { kind: 'ended', days: null };
  }
  if (!policy.renewsOn) {
    return { kind: 'active', days: null };
  }
  const days = daysBetween(today, policy.renewsOn);
  return days < 0
    ? { kind: 'overdue', days: -days }
    : days <= RENEWAL_SOON_DAYS
      ? { kind: 'soon', days }
      : { kind: 'active', days };
}

/** One tax year's items, open ones first (as the API orders them), and what's deductible per currency. */
export interface TaxYearGroup {
  taxYear: string | null;
  items: TaxItem[];
  open: number;
  deductible: { currency: string; total: number }[];
}

/** Items grouped by their tax-year label, in the API's order (newest year first, items without a year last). */
export function taxYearGroups(items: readonly TaxItem[]): TaxYearGroup[] {
  const groups = new Map<string | null, TaxItem[]>();
  for (const item of items) {
    const key = item.taxYear?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const keys = [...groups.keys()];
  const ordered = [...keys.filter((k) => k !== null), ...keys.filter((k) => k === null)];
  return ordered.map((taxYear) => {
    const list = groups.get(taxYear)!;
    const totals = new Map<string, number>();
    for (const item of list) {
      if (item.isDeductible && item.amount !== null && item.currency) {
        totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount);
      }
    }
    return {
      taxYear,
      items: list,
      open: list.filter((i) => !i.doneOn).length,
      deductible: [...totals]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, total]) => ({ currency, total: Math.round(total * 10000) / 10000 })),
    };
  });
}

/** "Due 31/Oct · 12 days left" style urgency for an open tax item (null: done or undated). */
export function taxDueDays(item: Pick<TaxItem, 'dueOn' | 'doneOn'>, today: string): number | null {
  return item.doneOn || !item.dueOn ? null : daysBetween(today, item.dueOn);
}

/** The currencies an account holds, its main one first (a single-currency account holds just one). */
export function heldCurrencies(
  account: { currency: string; balances?: { currency: string }[] } | undefined,
): string[] {
  if (!account) {
    return [];
  }
  return account.balances?.length ? account.balances.map((b) => b.currency) : [account.currency];
}

/**
 * Which currency money moves in on an account: the one chosen if the account holds it, else `preferred` if held
 * (a transfer arriving as it left), else the account's main one. Null without an account.
 */
export function pickCurrency(
  held: readonly string[],
  chosen: string | null | undefined,
  preferred: string | null = null,
): string | null {
  if (held.length === 0) {
    return null;
  }
  if (chosen && held.includes(chosen)) {
    return chosen;
  }
  return preferred && held.includes(preferred) ? preferred : held[0];
}
