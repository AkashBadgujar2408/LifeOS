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

/** A row of the "known money coming" table: the item and what it is in the line's currency. */
export interface ForecastRow {
  item: ForecastItem;
  /** In the line's currency (the base currency for the overall line); null: no rate, left out. */
  amount: number | null;
}

/**
 * The known items that belong to a line, in order: an account's line only has its own money in its currency; the
 * overall line has everything, in the base currency.
 */
export function forecastRows(
  line: Pick<ForecastLine, 'accountId' | 'currency'>,
  items: readonly ForecastItem[],
): ForecastRow[] {
  const overall = line.accountId === null;
  return items
    .filter((i) => overall || (i.accountId === line.accountId && i.currency === line.currency))
    .map((item) => ({ item, amount: overall ? item.amountInBase : item.amount }));
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
