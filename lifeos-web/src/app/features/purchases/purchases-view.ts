import type { MoneyAmount, Purchase, WishPriority } from '../../core/services/purchases.service';
import { formatMoney } from '../finance/finance-view';

export const WISH_PRIORITY_LABELS: Record<WishPriority, string> = {
  High: 'Really want',
  Medium: 'Would like',
  Low: 'Someday',
};

/** A month of purchases, newest month first, with its totals per currency. */
export interface PurchaseMonth {
  /** yyyy-MM. */
  key: string;
  purchases: Purchase[];
  totals: MoneyAmount[];
}

/** What was paid per currency (currencies A–Z). */
export function purchaseTotals(
  purchases: readonly Pick<Purchase, 'amount' | 'currency'>[],
): MoneyAmount[] {
  const sums = new Map<string, number>();
  for (const p of purchases) {
    sums.set(p.currency, (sums.get(p.currency) ?? 0) + p.amount);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}

/** Purchases (newest first) grouped by the month they were bought in, keeping their order. */
export function groupByMonth(purchases: readonly Purchase[]): PurchaseMonth[] {
  const months: PurchaseMonth[] = [];
  for (const p of purchases) {
    const key = p.purchasedOn.slice(0, 7);
    let month = months.find((m) => m.key === key);
    if (!month) {
      month = { key, purchases: [], totals: [] };
      months.push(month);
    }
    month.purchases.push(p);
  }
  for (const month of months) {
    month.totals = purchaseTotals(month.purchases);
  }
  return months;
}

/**
 * Paid against the estimate, in words: "₹990.00 over the estimate", "₹1,000.00 under", "as estimated" — null without
 * an estimate.
 */
export function estimateText(
  p: Pick<Purchase, 'amount' | 'estimatedAmount' | 'currency'>,
): string | null {
  if (p.estimatedAmount === null) {
    return null;
  }
  const diff = Math.round((p.amount - p.estimatedAmount) * 100) / 100;
  if (diff === 0) {
    return 'as estimated';
  }
  return diff > 0
    ? `${formatMoney(diff, p.currency)} over the estimate`
    : `${formatMoney(-diff, p.currency)} under the estimate`;
}

/** Spending against estimates, per currency, over the purchases that had one: estimated, paid, difference. */
export function estimateSummary(
  purchases: readonly Pick<Purchase, 'amount' | 'estimatedAmount' | 'currency'>[],
): { currency: string; estimated: number; paid: number; difference: number }[] {
  const sums = new Map<string, { estimated: number; paid: number }>();
  for (const p of purchases) {
    if (p.estimatedAmount === null) {
      continue;
    }
    const sum = sums.get(p.currency) ?? { estimated: 0, paid: 0 };
    sum.estimated += p.estimatedAmount;
    sum.paid += p.amount;
    sums.set(p.currency, sum);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, s]) => ({
      currency,
      estimated: Math.round(s.estimated * 100) / 100,
      paid: Math.round(s.paid * 100) / 100,
      difference: Math.round((s.paid - s.estimated) * 100) / 100,
    }));
}

/** A shopping list's leftover estimate as one line: "₹570.00 left to buy" (several currencies joined). */
export function leftText(left: readonly MoneyAmount[]): string | null {
  return left.length
    ? `${left.map((m) => formatMoney(m.amount, m.currency)).join(' + ')} left to buy`
    : null;
}
