import {
  detectDelimiter,
  guessMapping,
  mapStatement,
  parseAmount,
  parseCsv,
  parseStatementDate,
  StatementMapping,
} from './statement-csv';

describe('parseCsv', () => {
  it('handles quotes, embedded separators and line breaks, and drops blank rows', () => {
    const text =
      '﻿Date,Narration,Amount\r\n01/10/2026,"SALARY, OCT",52000\n\n03/10/2026,"say ""hi""\nthere",-150\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Narration', 'Amount'],
      ['01/10/2026', 'SALARY, OCT', '52000'],
      ['03/10/2026', 'say "hi"\nthere', '-150'],
    ]);
  });

  it('detects semicolons and tabs', () => {
    expect(detectDelimiter('Datum;Betrag;Text\n')).toBe(';');
    expect(detectDelimiter('Date\tAmount\n')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d\n')).toBe(',');
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseStatementDate', () => {
  it('reads each format and refuses days that do not exist', () => {
    expect(parseStatementDate('05/10/2026', 'dd/MM/yyyy')).toBe('2026-10-05');
    expect(parseStatementDate('10/05/2026', 'MM/dd/yyyy')).toBe('2026-10-05');
    expect(parseStatementDate('2026-10-05', 'yyyy-MM-dd')).toBe('2026-10-05');
    expect(parseStatementDate('2026-10-05T00:00:00', 'yyyy-MM-dd')).toBe('2026-10-05');
    expect(parseStatementDate('05.10.2026', 'dd.MM.yyyy')).toBe('2026-10-05');
    expect(parseStatementDate('5-Oct-2026', 'dd MMM yyyy')).toBe('2026-10-05');
    expect(parseStatementDate('05 October 2026', 'dd MMM yyyy')).toBe('2026-10-05');
    expect(parseStatementDate('05/10/26', 'dd/MM/yy')).toBe('2026-10-05');
    expect(parseStatementDate('31/02/2026', 'dd/MM/yyyy')).toBeNull();
    expect(parseStatementDate('13/13/2026', 'dd/MM/yyyy')).toBeNull();
    expect(parseStatementDate('2026-10-05', 'dd/MM/yyyy')).toBeNull();
    expect(parseStatementDate('', 'dd/MM/yyyy')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('reads the ways banks write money', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-1234.5')).toBe(-1234.5);
    expect(parseAmount('(1,234.56)')).toBe(-1234.56);
    expect(parseAmount('1,234.56 Dr')).toBe(-1234.56);
    expect(parseAmount('500.00 CR')).toBe(500);
    expect(parseAmount('₹ 2,400')).toBe(2400);
    expect(parseAmount('+75')).toBe(75);
    expect(parseAmount('1.234,56', true)).toBe(1234.56);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
  });
});

describe('mapStatement', () => {
  const split: StatementMapping = {
    hasHeader: true,
    date: 0,
    dateFormat: 'dd/MM/yy',
    amountMode: 'split',
    amount: null,
    amountOutIsPositive: false,
    debit: 2,
    credit: 3,
    description: 1,
    reference: 4,
    decimalComma: false,
  };

  it('turns debit/credit columns into signed lines and flags bad rows by file line', () => {
    const rows = [
      ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Chq./Ref.No.'],
      ['01/10/26', 'SALARY', '', '52,000.00', 'NEFT1'],
      ['03/10/26', 'CAFE', '150.00', '', ''],
      ['xx/10/26', 'BAD DATE', '1.00', '', ''],
      ['04/10/26', 'NOTHING', '', '', ''],
    ];
    const mapped = mapStatement(rows, split);
    expect(mapped.map((m) => m.line?.amount ?? m.error)).toEqual([
      52000,
      -150,
      '"xx/10/26" isn\'t a dd/MM/yy date.',
      'No amount.',
    ]);
    expect(mapped[0].line).toEqual({
      occurredOn: '2026-10-01',
      amount: 52000,
      description: 'SALARY',
      reference: 'NEFT1',
    });
    expect(mapped[2].fileLine).toBe(4);
  });

  it('flips a card statement whose spending is positive', () => {
    const mapping: StatementMapping = {
      ...split,
      hasHeader: false,
      amountMode: 'amount',
      amount: 2,
      amountOutIsPositive: true,
      debit: null,
      credit: null,
      reference: null,
    };
    expect(mapStatement([['05/10/26', 'AMAZON', '999']], mapping)[0].line?.amount).toBe(-999);
  });
});

describe('guessMapping', () => {
  it('finds the usual columns by whole words', () => {
    const m = guessMapping(['Txn Date', 'Description', 'Debit', 'Credit', 'Ref No']);
    expect(m).toMatchObject({
      date: 0,
      description: 1,
      amountMode: 'split',
      debit: 2,
      credit: 3,
      reference: 4,
    });
    // "Description" contains "cr" but isn't the credit column.
    expect(guessMapping(['Date', 'Description', 'Amount'])).toMatchObject({
      amountMode: 'amount',
      amount: 2,
      debit: null,
    });
  });
});
