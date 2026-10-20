import type {
  Benefit,
  BenefitKind,
  MoneyAmount,
  Purchase,
  ReturnState,
  SubscriptionFrequency,
  WishPriority,
} from '../../core/services/purchases.service';
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

// ---- Rewards & vouchers ----

export const BENEFIT_KIND_LABELS: Record<BenefitKind, string> = {
  Voucher: 'Voucher',
  GiftCard: 'Gift card',
  StoreCredit: 'Store credit',
  Coupon: 'Coupon / promo code',
  Cashback: 'Cashback',
  Points: 'Reward points',
  WalletCredit: 'Wallet credit',
};

export const BENEFIT_KIND_ICONS: Record<BenefitKind, string> = {
  Voucher: 'bi-ticket-perforated',
  GiftCard: 'bi-gift',
  StoreCredit: 'bi-shop',
  Coupon: 'bi-percent',
  Cashback: 'bi-arrow-counterclockwise',
  Points: 'bi-stars',
  WalletCredit: 'bi-wallet2',
};

/**
 * What a reward is worth in words: "₹200.00 left of ₹500.00", "10% off (spend ₹1,000.00+)", "₹150.00 cashback",
 * "1,300 points ≈ ₹650.00".
 */
export function benefitWorth(
  b: Pick<
    Benefit,
    | 'kind'
    | 'value'
    | 'currency'
    | 'balance'
    | 'discountPercent'
    | 'minSpend'
    | 'pointsAvailable'
    | 'pointsValue'
  >,
): string {
  const money = (amount: number) => formatMoney(amount, b.currency ?? 'INR');
  switch (b.kind) {
    case 'Coupon': {
      const off =
        b.discountPercent !== null ? `${b.discountPercent}% off` : `${money(b.value ?? 0)} off`;
      return b.minSpend !== null ? `${off} (spend ${money(b.minSpend)}+)` : off;
    }
    case 'Cashback':
      return `${money(b.value ?? 0)} cashback`;
    case 'Points':
      return `${(b.pointsAvailable ?? 0).toLocaleString('en-IN')} points ≈ ${money(b.pointsValue ?? 0)}`;
    default:
      return b.balance !== null && b.balance !== b.value
        ? `${money(b.balance)} left of ${money(b.value ?? 0)}`
        : money(b.value ?? 0);
  }
}

/** What a coupon takes off a bill (the server's BenefitRules.CouponSaving): its share, never below the minimum spend. */
export function couponSaving(
  flat: number | null,
  percent: number | null,
  minSpend: number | null,
  bill: number,
): number {
  if (bill <= 0 || (minSpend !== null && bill < minSpend)) {
    return 0;
  }
  return Math.min(bill, flat ?? Math.round(bill * (percent ?? 0)) / 100);
}

export interface RewardGroups {
  usable: Benefit[];
  cashback: Benefit[];
  points: Benefit[];
  finished: Benefit[];
}

/**
 * The rewards page's sections: usable money and coupons (running out soonest first), cashback still to come (overdue
 * first), points programmes, and what's used up, expired or received.
 */
export function groupRewards(benefits: readonly Benefit[]): RewardGroups {
  const soonest = (b: Benefit) => b.nextExpiry ?? b.expiresOn ?? '9999-12-31';
  return {
    usable: benefits
      .filter((b) => b.status === 'Usable' && b.kind !== 'Points')
      .sort((a, b) => soonest(a).localeCompare(soonest(b)) || a.name.localeCompare(b.name)),
    cashback: benefits
      .filter((b) => b.status === 'Pending')
      .sort((a, b) => (a.expectedBy ?? '9999').localeCompare(b.expectedBy ?? '9999')),
    points: benefits.filter((b) => b.kind === 'Points'),
    finished: benefits.filter(
      (b) => b.kind !== 'Points' && b.status !== 'Usable' && b.status !== 'Pending',
    ),
  };
}

// ---- Subscriptions & returns ----

/** "a month", "every 2 months", "a year", "a week". */
export function everyText(frequency: SubscriptionFrequency, interval: number): string {
  const unit = { Weekly: 'week', Monthly: 'month', Yearly: 'year' }[frequency];
  return interval === 1 ? `a ${unit}` : `every ${interval} ${unit}s`;
}

export const RETURN_STATE_LABELS: Record<ReturnState, string> = {
  Open: 'To send back',
  Missed: 'Return day passed',
  AwaitingRefund: 'Sent back — refund to come',
  Refunded: 'Refunded',
};
