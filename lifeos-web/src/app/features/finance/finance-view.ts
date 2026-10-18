import type {
  AccountKind,
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
