import type {
  ForecastItem,
  ForecastLine,
  ForecastSource,
} from '../../core/services/finance.service';

export const FORECAST_SOURCE_LABELS: Record<ForecastSource, string> = {
  Repeating: 'Repeating',
  Bill: 'Bill',
  ExpectedBill: 'Expected bill',
  Loan: 'Loan instalment',
  Subscription: 'Subscription',
  Insurance: 'Insurance premium',
  Tax: 'Tax',
  Cashback: 'Cashback',
};

/** A row of the "coming up" table: the item, what it moves the line by, and the line's balance after it. */
export interface ForecastRow {
  item: ForecastItem;
  /** In the line's currency (the base currency for the overall line); null: no rate, left out. */
  amount: number | null;
  balanceAfter: number | null;
}

/**
 * The items that move a line, in order, each with the balance after it: an account's line moves only with its own
 * money in its currency; the overall line with everything, in the base currency.
 */
export function forecastRows(line: ForecastLine, items: readonly ForecastItem[]): ForecastRow[] {
  const overall = line.accountId === null;
  let balance = line.start;
  return items
    .filter((i) => overall || (i.accountId === line.accountId && i.currency === line.currency))
    .map((item) => {
      const amount = overall ? item.amountInBase : item.amount;
      if (amount !== null) {
        balance = Math.round((balance + amount) * 100) / 100;
      }
      return { item, amount, balanceAfter: amount === null ? null : balance };
    });
}

/**
 * What drives the dip: the biggest amounts going out on or before the lowest day (at most `count`), largest first —
 * what to move, delay or cover.
 */
export function dipDrivers(
  rows: readonly ForecastRow[],
  lowestDay: string,
  count = 3,
): ForecastRow[] {
  return rows
    .filter((r) => r.item.day <= lowestDay && r.amount !== null && r.amount < 0)
    .sort((a, b) => a.amount! - b.amount!)
    .slice(0, count);
}

/** Totals in and out over the rows (in the line's currency). */
export function forecastTotals(rows: readonly ForecastRow[]): {
  moneyIn: number;
  moneyOut: number;
} {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const r of rows) {
    if (r.amount !== null) {
      if (r.amount > 0) {
        moneyIn += r.amount;
      } else {
        moneyOut -= r.amount;
      }
    }
  }
  return { moneyIn: Math.round(moneyIn * 100) / 100, moneyOut: Math.round(moneyOut * 100) / 100 };
}
