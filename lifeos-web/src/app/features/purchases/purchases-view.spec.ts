import type { Benefit, Purchase } from '../../core/services/purchases.service';
import {
  benefitWorth,
  couponSaving,
  estimateSummary,
  estimateText,
  everyText,
  groupByMonth,
  groupRewards,
  leftText,
  purchaseTotals,
} from './purchases-view';

const purchase = (
  id: number,
  on: string,
  amount: number,
  extra: Partial<Purchase> = {},
): Purchase => ({
  id,
  title: `P${id}`,
  store: null,
  purchasedOn: on,
  amount,
  estimatedAmount: null,
  currency: 'INR',
  transactionId: null,
  paidFromAccountName: null,
  assetId: null,
  assetName: null,
  notes: null,
  tags: [],
  listItemCount: 0,
  wishlistItemName: null,
  ...extra,
});

describe('purchases view', () => {
  it('totals per currency and groups by month, newest first', () => {
    const list = [
      purchase(3, '2026-10-20', 12990),
      purchase(2, '2026-10-02', 548.5),
      purchase(1, '2026-09-28', 20, { currency: 'EUR' }),
    ];
    expect(purchaseTotals(list)).toEqual([
      { currency: 'EUR', amount: 20 },
      { currency: 'INR', amount: 13538.5 },
    ]);
    const months = groupByMonth(list);
    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-09']);
    expect(months[0].purchases.map((p) => p.id)).toEqual([3, 2]);
    expect(months[0].totals).toEqual([{ currency: 'INR', amount: 13538.5 }]);
  });

  it('compares what was paid with what was expected', () => {
    expect(estimateText(purchase(1, '2026-10-20', 12990, { estimatedAmount: 12000 }))).toBe(
      '₹990.00 over the estimate',
    );
    expect(estimateText(purchase(1, '2026-10-20', 548, { estimatedAmount: 570 }))).toBe(
      '₹22.00 under the estimate',
    );
    expect(estimateText(purchase(1, '2026-10-20', 500, { estimatedAmount: 500 }))).toBe(
      'as estimated',
    );
    expect(estimateText(purchase(1, '2026-10-20', 500))).toBeNull();
    expect(
      estimateSummary([
        purchase(1, '2026-10-20', 12990, { estimatedAmount: 12000 }),
        purchase(2, '2026-10-20', 548, { estimatedAmount: 570 }),
        purchase(3, '2026-10-20', 999),
      ]),
    ).toEqual([{ currency: 'INR', estimated: 12570, paid: 13538, difference: 968 }]);
  });

  it('says what a list still costs', () => {
    expect(leftText([{ currency: 'INR', amount: 570 }])).toBe('₹570.00 left to buy');
    expect(leftText([])).toBeNull();
  });
});

const reward = (id: number, extra: Partial<Benefit>): Benefit => ({
  id,
  kind: 'Voucher',
  name: `R${id}`,
  store: null,
  value: 500,
  currency: 'INR',
  discountPercent: null,
  minSpend: null,
  valuePerPoint: null,
  hasCode: false,
  hasPin: false,
  code: null,
  pin: null,
  expiresOn: null,
  reminderDays: null,
  purchaseId: null,
  purchaseTitle: null,
  accountId: null,
  accountName: null,
  expectedBy: null,
  receivedOn: null,
  transactionId: null,
  notes: null,
  status: 'Usable',
  balance: 500,
  pointsAvailable: null,
  pointsValue: null,
  lost: 0,
  lostOn: null,
  expiringSoon: false,
  overdue: false,
  nextExpiry: null,
  ...extra,
});

describe('rewards view', () => {
  it('says what a reward is worth', () => {
    expect(benefitWorth(reward(1, { balance: 200 }))).toBe('₹200.00 left of ₹500.00');
    expect(benefitWorth(reward(1, {}))).toBe('₹500.00');
    expect(
      benefitWorth(reward(2, { kind: 'Coupon', value: null, discountPercent: 10, minSpend: 1000 })),
    ).toBe('10% off (spend ₹1,000.00+)');
    expect(
      benefitWorth(
        reward(3, { kind: 'Points', value: null, pointsAvailable: 1300, pointsValue: 650 }),
      ),
    ).toBe('1,300 points ≈ ₹650.00');
    expect(benefitWorth(reward(4, { kind: 'Cashback', value: 150 }))).toBe('₹150.00 cashback');
  });

  it('works out a coupon the way the server does', () => {
    expect(couponSaving(null, 10, 1000, 2500)).toBe(250);
    expect(couponSaving(null, 10, 1000, 900)).toBe(0);
    expect(couponSaving(200, null, null, 150)).toBe(150);
  });

  it('groups rewards: usable soonest first, cashback, points, the rest', () => {
    const groups = groupRewards([
      reward(1, { nextExpiry: '2026-12-31' }),
      reward(2, { nextExpiry: '2026-11-01' }),
      reward(3, { kind: 'Cashback', status: 'Pending', expectedBy: '2026-10-15' }),
      reward(4, { kind: 'Points' }),
      reward(5, { status: 'Expired' }),
    ]);
    expect(groups.usable.map((b) => b.id)).toEqual([2, 1]);
    expect(groups.cashback.map((b) => b.id)).toEqual([3]);
    expect(groups.points.map((b) => b.id)).toEqual([4]);
    expect(groups.finished.map((b) => b.id)).toEqual([5]);
  });
});

describe('subscriptions view', () => {
  it('says how often it charges', () => {
    expect(everyText('Monthly', 1)).toBe('a month');
    expect(everyText('Monthly', 3)).toBe('every 3 months');
    expect(everyText('Yearly', 1)).toBe('a year');
    expect(everyText('Weekly', 2)).toBe('every 2 weeks');
  });
});
