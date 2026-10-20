import {
  detectDelimiter,
  findHeaderRow,
  guessMapping,
  guessStatementMapping,
  mapStatement,
  parseAmount,
  parseCsv,
  parseStatementDate,
  SAMPLE_STATEMENT_CSV,
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
    headerRow: 0,
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
      headerRow: null,
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

describe('findHeaderRow', () => {
  // How several banks export: account details above the table, a blank-ish line, then the column names.
  const withDetails = [
    ['Account Name', 'AKASH B'],
    ['Account Number', 'XXXX1234'],
    ['Statement From', '01/10/2026', 'To', '31/10/2026'],
    ['Date', 'Narration', 'Chq./Ref.No.', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['01/10/26', 'SALARY', 'NEFT1', '', '52,000.00', '52,000.00'],
    ['03/10/26', 'CAFE', '', '150.00', '', '51,850.00'],
  ];

  it('finds the column names below the account details', () => {
    expect(findHeaderRow(withDetails)).toBe(3);
    const m = guessStatementMapping(withDetails);
    expect(m).toMatchObject({
      headerRow: 3,
      date: 0,
      description: 1,
      reference: 2,
      debit: 3,
      credit: 4,
    });
  });

  it('ignores the rows above the column names when mapping', () => {
    const mapped = mapStatement(withDetails, {
      ...guessStatementMapping(withDetails),
      dateFormat: 'dd/MM/yy',
    });
    expect(mapped.map((r) => r.line?.amount)).toEqual([52000, -150]);
    expect(mapped[0].fileLine).toBe(5);
  });

  it('falls back to the first row when no names can be told', () => {
    expect(findHeaderRow([['01/10/2026', 'SALARY', '52000']])).toBe(0);
    expect(findHeaderRow([])).toBe(0);
  });
});

describe('SAMPLE_STATEMENT_CSV', () => {
  it('maps itself with nothing to change and reads every line', () => {
    const rows = parseCsv(SAMPLE_STATEMENT_CSV);
    const mapping = guessStatementMapping(rows);
    expect(mapping).toMatchObject({
      headerRow: 0,
      date: 0,
      dateFormat: 'dd/MM/yyyy',
      description: 1,
      reference: 2,
      amountMode: 'split',
      debit: 3,
      credit: 4,
    });
    const mapped = mapStatement(rows, mapping);
    expect(mapped.every((r) => r.line)).toBe(true);
    expect(mapped.map((r) => r.line!.amount)).toEqual([52000, -1250.5, -1840]);
    expect(mapped[2].line!.description).toBe('Electricity bill, September');
  });
});
