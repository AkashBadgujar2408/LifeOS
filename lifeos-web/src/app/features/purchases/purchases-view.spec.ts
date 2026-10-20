import type { Purchase } from '../../core/services/purchases.service';
import {
  estimateSummary,
  estimateText,
  groupByMonth,
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
