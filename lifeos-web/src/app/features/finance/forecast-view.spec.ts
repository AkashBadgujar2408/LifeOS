import type { ForecastItem, ForecastLine } from '../../core/services/finance.service';
import { dipDrivers, forecastRows, forecastTotals } from './forecast-view';

const item = (day: string, amount: number, extra: Partial<ForecastItem> = {}): ForecastItem => ({
  day,
  source: 'Repeating',
  title: `T${day}`,
  accountId: 1,
  accountName: 'HDFC',
  amount,
  currency: 'INR',
  amountInBase: amount,
  isEstimate: false,
  ...extra,
});

const line = (accountId: number | null, start: number): ForecastLine => ({
  accountId,
  name: accountId ? 'HDFC' : 'All accounts',
  currency: 'INR',
  start,
  end: 0,
  lowest: { day: '2026-11-10', balance: 0 },
  points: [],
});

describe('forecast view', () => {
  const items = [
    item('2026-11-05', -3000),
    item('2026-11-06', -1840, { accountId: null, accountName: null, source: 'Bill' }),
    item('2026-11-10', -9000),
    item('2026-11-12', -10, { currency: 'USD', amountInBase: -840 }),
    item('2026-11-15', 5000, { currency: 'EUR', amountInBase: null, accountId: 2 }),
  ];

  it("runs an account's own money, and everything in the base currency overall", () => {
    expect(forecastRows(line(1, 10000), items).map((r) => r.balanceAfter)).toEqual([7000, -2000]);
    expect(forecastRows(line(null, 10000), items).map((r) => r.balanceAfter)).toEqual([
      7000,
      5160,
      -3840,
      -4680,
      null,
    ]);
  });

  it('names the biggest money going out up to the lowest day', () => {
    const rows = forecastRows(line(null, 10000), items);
    expect(dipDrivers(rows, '2026-11-10').map((r) => r.amount)).toEqual([-9000, -3000, -1840]);
    expect(forecastTotals(rows)).toEqual({ moneyIn: 0, moneyOut: 14680 });
  });
});
