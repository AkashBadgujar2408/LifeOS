import { CSV_BOM, buildCsv, csvCell, csvFileName } from './grid-csv';

describe('grid CSV', () => {
  it('neutralises text a spreadsheet would run as a formula', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@here')).toBe("'@here");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('+₹500.00')).toBe("'+₹500.00");
  });

  it('leaves plain numbers and ordinary text alone', () => {
    expect(csvCell('-12.5')).toBe('-12.5');
    expect(csvCell('42')).toBe('42');
    expect(csvCell('−₹1,200.00')).toBe('"−₹1,200.00"');
    expect(csvCell('14/Oct/2026')).toBe('14/Oct/2026');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(7)).toBe('7');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Rice, dal')).toBe('"Rice, dal"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=a,b')).toBe(`"'=a,b"`);
  });

  it('builds a BOM-prefixed file with CRLF lines', () => {
    const csv = buildCsv(
      ['Day', 'What', 'Amount'],
      [
        ['14/Oct/2026', 'Groceries, DMart', '−₹548.00'],
        ['15/Oct/2026', 'Salary', '₹50,000.00'],
      ],
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(
      CSV_BOM +
        'Day,What,Amount\r\n' +
        '14/Oct/2026,"Groceries, DMart",−₹548.00\r\n' +
        '15/Oct/2026,Salary,"₹50,000.00"\r\n',
    );
  });

  it('names the file after the list and the day', () => {
    expect(csvFileName('Transactions', '2026-10-21')).toBe('lifeos-transactions-2026-10-21.csv');
    expect(csvFileName('Job applications', '2026-10-21')).toBe(
      'lifeos-job-applications-2026-10-21.csv',
    );
    expect(csvFileName('***', '2026-10-21')).toBe('lifeos-list-2026-10-21.csv');
  });
});
