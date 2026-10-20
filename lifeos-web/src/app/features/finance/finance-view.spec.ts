import type { TaxItem, Transaction } from '../../core/services/finance.service';
import {
  accountLine,
  baseTotal,
  budgetBar,
  currentRates,
  formatMoney,
  heldCurrencies,
  pickCurrency,
  loanRepaidPercent,
  loanScheduleText,
  loanTermsText,
  monthLabel,
  monthRange,
  netWorthChange,
  policyStatus,
  taxDueDays,
  taxYearGroups,
  rateOn,
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

  it('describes a loan: terms, share paid back, against its schedule', () => {
    const emi = { annualRate: 12, repaymentKind: 'Emi' as const, emi: 10661.85, currency: 'INR' };
    expect(loanTermsText(emi)).toBe('12% · ₹10,661.85 a month');
    expect(loanTermsText({ ...emi, annualRate: 0, repaymentKind: 'Flexible', emi: null })).toBe(
      'Interest-free · pay as you go',
    );
    expect(loanRepaidPercent({ principal: 50000, outstanding: 20000 })).toBe(60);
    expect(loanRepaidPercent({ principal: 50000, outstanding: 51000 })).toBe(0);
    const base = { currency: 'INR', closedOn: null, repaymentKind: 'Emi' as const };
    expect(loanScheduleText({ ...base, behind: 0.4 })?.state).toBe('on');
    expect(loanScheduleText({ ...base, behind: 10758.37 })?.text).toBe('Behind by ₹10,758.37');
    expect(loanScheduleText({ ...base, behind: -500 })?.text).toBe('Ahead by ₹500.00');
    expect(loanScheduleText({ ...base, repaymentKind: 'Flexible', behind: null })).toBeNull();
  });
});

describe('exchange-rate master', () => {
  const rate = (id: number, currency: string, value: number, effectiveOn: string) => ({
    id,
    currency,
    baseCurrency: 'INR',
    rate: value,
    effectiveOn,
  });
  const rates = [
    rate(1, 'USD', 80, '2026-05-01'),
    rate(2, 'USD', 86, '2026-10-01'),
    rate(3, 'GBP', 110, '2026-10-01'),
  ];

  it('finds the rate in force on a day', () => {
    expect(rateOn(rates, 'USD', '2026-10-18')).toBe(86);
    expect(rateOn(rates, 'USD', '2026-09-30')).toBe(80);
    expect(rateOn(rates, 'USD', '2026-04-30')).toBeNull();
    expect(rateOn(rates, 'EUR', '2026-10-18')).toBeNull();
  });

  it('lists each currency with its current rate and history', () => {
    const list = currentRates(rates, '2026-10-18');
    expect(list.map((r) => r.currency)).toEqual(['GBP', 'USD']);
    expect(list[1].current?.rate).toBe(86);
    expect(list[1].history.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('accounts in the base currency', () => {
  it('adds converted balances and names the ones without a rate', () => {
    expect(
      baseTotal(
        [
          { name: 'Bank', currency: 'INR', balanceInBase: 100000 },
          { name: 'UK account', currency: 'GBP', balanceInBase: 110000 },
          { name: 'Euro cash', currency: 'EUR', balanceInBase: null },
        ],
        'INR',
      ),
    ).toEqual({ currency: 'INR', total: 210000, missing: ['Euro cash'] });
    expect(baseTotal([{ name: 'Bank', currency: 'INR', balanceInBase: 5 }], 'INR')).toBeNull();
    expect(baseTotal([{ name: 'UK', currency: 'GBP', balanceInBase: null }], null)).toBeNull();
  });
});

describe('policyStatus', () => {
  const today = '2026-10-19';
  it('says whether a policy has ended, is overdue, renews soon or is in force', () => {
    expect(policyStatus({ renewsOn: '2026-11-01', endsOn: null }, today)).toEqual({
      kind: 'soon',
      days: 13,
    });
    expect(policyStatus({ renewsOn: '2027-04-01', endsOn: null }, today).kind).toBe('active');
    expect(policyStatus({ renewsOn: '2026-10-10', endsOn: null }, today)).toEqual({
      kind: 'overdue',
      days: 9,
    });
    expect(policyStatus({ renewsOn: '2026-11-01', endsOn: '2026-10-18' }, today).kind).toBe(
      'ended',
    );
    expect(policyStatus({ renewsOn: null, endsOn: null }, today)).toEqual({
      kind: 'active',
      days: null,
    });
  });
});

describe('taxYearGroups', () => {
  function item(overrides: Partial<TaxItem>): TaxItem {
    return {
      id: 1,
      title: 'x',
      kind: 'Deduction',
      taxYear: 'FY 2026-27',
      dueOn: null,
      amount: null,
      currency: null,
      isDeductible: false,
      transactionId: null,
      transactionOn: null,
      transactionPayee: null,
      transactionAmount: null,
      transactionCurrency: null,
      doneOn: null,
      notes: null,
      ...overrides,
    };
  }

  it('groups by year (unlabelled last) and adds up deductible amounts per currency', () => {
    const groups = taxYearGroups([
      item({ id: 1, taxYear: null, amount: 10, currency: 'INR', isDeductible: true }),
      item({ id: 2, amount: 150_000, currency: 'INR', isDeductible: true }),
      item({ id: 3, amount: 25_000, currency: 'INR', isDeductible: true, doneOn: '2026-10-01' }),
      item({ id: 4, amount: 9_000, currency: 'INR', isDeductible: false }),
      item({ id: 5, amount: 100, currency: 'USD', isDeductible: true }),
      item({ id: 6, taxYear: 'FY 2025-26' }),
    ]);
    expect(groups.map((g) => g.taxYear)).toEqual(['FY 2026-27', 'FY 2025-26', null]);
    expect(groups[0].deductible).toEqual([
      { currency: 'INR', total: 175_000 },
      { currency: 'USD', total: 100 },
    ]);
    expect(groups[0].open).toBe(3);
  });

  it('counts days to an open due date only', () => {
    expect(taxDueDays(item({ dueOn: '2026-10-31' }), '2026-10-19')).toBe(12);
    expect(
      taxDueDays(item({ dueOn: '2026-10-31', doneOn: '2026-10-19' }), '2026-10-19'),
    ).toBeNull();
    expect(taxDueDays(item({}), '2026-10-19')).toBeNull();
  });
});

describe('multi-currency accounts', () => {
  const wise = {
    currency: 'USD',
    balances: [{ currency: 'USD' }, { currency: 'EUR' }, { currency: 'GBP' }],
  };

  it('lists what an account holds, main currency first', () => {
    expect(heldCurrencies(wise)).toEqual(['USD', 'EUR', 'GBP']);
    expect(heldCurrencies({ currency: 'INR', balances: [] })).toEqual(['INR']);
    expect(heldCurrencies(undefined)).toEqual([]);
  });

  it('picks the chosen currency if held, else the preferred one, else the main one', () => {
    const held = heldCurrencies(wise);
    expect(pickCurrency(held, 'GBP')).toBe('GBP');
    expect(pickCurrency(held, 'JPY')).toBe('USD');
    expect(pickCurrency(held, null, 'EUR')).toBe('EUR');
    expect(pickCurrency(held, null, 'INR')).toBe('USD');
    expect(pickCurrency([], 'GBP')).toBeNull();
  });
});
