import { AppDateParserFormatter, IsoDateAdapter } from './date-format';

describe('AppDateParserFormatter', () => {
  const formatter = new AppDateParserFormatter();

  it('formats as dd/MMM/yyyy', () => {
    expect(formatter.format({ year: 2026, month: 10, day: 14 })).toBe('14/Oct/2026');
    expect(formatter.format({ year: 2027, month: 1, day: 5 })).toBe('05/Jan/2027');
    expect(formatter.format(null)).toBe('');
  });

  it('parses its own format and common variants', () => {
    const expected = { year: 2026, month: 10, day: 14 };
    expect(formatter.parse('14/Oct/2026')).toEqual(expected);
    expect(formatter.parse(' 14/oct/2026 ')).toEqual(expected);
    expect(formatter.parse('14 October 2026')).toEqual(expected);
    expect(formatter.parse('14-10-2026')).toEqual(expected);
    expect(formatter.parse('4/Mar/2027')).toEqual({ year: 2027, month: 3, day: 4 });
  });

  it('rejects text that is not a date', () => {
    expect(formatter.parse('')).toBeNull();
    expect(formatter.parse('next week')).toBeNull();
    expect(formatter.parse('14/Foo/2026')).toBeNull();
    expect(formatter.parse('14/13/2026')).toBeNull();
    expect(formatter.parse('2026-10-14')).toBeNull();
  });
});

describe('IsoDateAdapter', () => {
  const adapter = new IsoDateAdapter();

  it('round-trips the API DATE shape without any timezone shift', () => {
    expect(adapter.fromModel('2026-03-01')).toEqual({ year: 2026, month: 3, day: 1 });
    expect(adapter.toModel({ year: 2026, month: 3, day: 1 })).toBe('2026-03-01');
  });

  it('treats empty and malformed values as no date', () => {
    expect(adapter.fromModel(null)).toBeNull();
    expect(adapter.fromModel('')).toBeNull();
    expect(adapter.fromModel('14/Oct/2026')).toBeNull();
    expect(adapter.toModel(null)).toBeNull();
  });
});
