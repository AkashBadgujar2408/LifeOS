import type { Transaction } from '../../core/services/finance.service';
import {
  accountLine,
  budgetBar,
  formatMoney,
  loanPaidPercent,
  monthLabel,
  monthRange,
  netWorthChange,
  shiftMonth,
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

describe('finance months and budget bars', () => {
  it('names and moves months without Date', () => {
    expect(monthLabel('2026-10-01')).toBe('October 2026');
    expect(shiftMonth('2026-10-01', 1)).toBe('2026-11-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-03-01', -14)).toBe('2025-01-01');
  });

  it('caps the bar at its track and flags the overspend', () => {
    expect(budgetBar({ percentUsed: 110, isOver: true })).toEqual({ width: 100, over: true });
    expect(budgetBar({ percentUsed: 45, isOver: false })).toEqual({ width: 45, over: false });
    expect(budgetBar({ percentUsed: null, isOver: false })).toEqual({ width: 0, over: false });
  });
});

describe('net worth and loans in words', () => {
  it('measures the change from the oldest point to now', () => {
    expect(netWorthChange([])).toBeNull();
    expect(
      netWorthChange([
        { day: '2025-10-31', assets: 50000, liabilities: 0, net: 50000 },
        { day: '2026-10-18', assets: 222320, liabilities: 992732.43, net: -770412.43 },
      ]),
    ).toEqual({ change: -820412.43, since: '2025-10-31' });
  });

  it('counts instalments paid as a share', () => {
    expect(loanPaidPercent(9, 240)).toBe(3);
    expect(loanPaidPercent(0, 0)).toBe(0);
    expect(loanPaidPercent(240, 240)).toBe(100);
  });
});
