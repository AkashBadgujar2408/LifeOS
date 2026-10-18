import type {
  AccountKind,
  HoldingKind,
  LoanKind,
  NetWorthPoint,
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
