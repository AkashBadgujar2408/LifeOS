import type { Transaction } from '../../core/services/finance.service';
import {
  accountLine,
  formatMoney,
  monthRange,
  signedAmount,
  signedMoney,
  totalsByCurrency,
  transactionTitle,
} from './finance-view';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    kind: 'Expense',
    occurredOn: '2026-10-05',
    amount: 100,
    currency: 'INR',
    exchangeRate: null,
    toAmount: null,
    fromAccountId: 1,
    fromAccountName: 'HDFC',
    toAccountId: null,
    toAccountName: null,
    toCurrency: null,
    payee: null,
    note: null,
    reference: null,
    employmentId: null,
    employmentTitle: null,
    sideIncomeSourceId: null,
    sideIncomeName: null,
    recurringTransactionId: null,
    recurringName: null,
    tags: [],
    ...overrides,
  };
}

describe('finance view', () => {
  it('formats money in the currency with a real minus sign', () => {
    expect(formatMoney(1250.5, 'INR')).toBe('₹1,250.50');
    expect(formatMoney(-400, 'INR')).toBe('−₹400.00');
    expect(formatMoney(150000, 'INR')).toBe('₹1,50,000.00');
    expect(formatMoney(10, 'USD')).toBe('$10.00');
  });

  it('signs income in, expenses out, and transfers from the account in view', () => {
    expect(
      signedAmount(tx({ kind: 'Income', toAccountId: 1, fromAccountId: null }), null).sign,
    ).toBe(1);
    expect(signedAmount(tx({}), null)).toEqual({ amount: -100, currency: 'INR', sign: -1 });

    const transfer = tx({
      kind: 'Transfer',
      amount: 100,
      currency: 'USD',
      fromAccountId: 3,
      toAccountId: 1,
      toAmount: 8350,
      toCurrency: 'INR',
    });
    expect(signedAmount(transfer, null).sign).toBe(0);
    expect(signedAmount(transfer, 3)).toEqual({ amount: -100, currency: 'USD', sign: -1 });
    expect(signedAmount(transfer, 1)).toEqual({ amount: 8350, currency: 'INR', sign: 1 });
    expect(signedMoney(transfer, 1)).toBe('+₹8,350.00');
    expect(signedMoney(transfer, null)).toBe('$100.00');
  });

  it('names the accounts and the row', () => {
    expect(accountLine(tx({}))).toBe('HDFC');
    expect(accountLine(tx({ kind: 'Transfer', toAccountId: 2, toAccountName: 'Cash' }))).toBe(
      'HDFC → Cash',
    );
    expect(transactionTitle(tx({ payee: 'Big Basket', note: 'Weekly shop' }))).toBe('Big Basket');
    expect(transactionTitle(tx({ note: 'Weekly shop' }))).toBe('Weekly shop');
    expect(transactionTitle(tx({ kind: 'Income', employmentTitle: 'Dev at Acme' }))).toBe(
      'Dev at Acme',
    );
    expect(transactionTitle(tx({}))).toBe('Expense');
  });

  it('finds the month a day is in, leap years included', () => {
    expect(monthRange('2026-10-18')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2100-02-10')).toEqual({ from: '2100-02-01', to: '2100-02-28' });
    expect(monthRange('2026-04-30')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('adds balances up per currency, never across', () => {
    expect(
      totalsByCurrency([
        { currency: 'INR', balance: 64099.5 },
        { currency: 'USD', balance: 90 },
        { currency: 'INR', balance: 3100 },
      ]),
    ).toEqual([
      { currency: 'INR', total: 67199.5 },
      { currency: 'USD', total: 90 },
    ]);
  });
});
