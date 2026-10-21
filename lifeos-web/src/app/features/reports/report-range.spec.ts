import { presetOf, presetRange, rangeDays, rangeError, readRange } from './report-range';

describe('presetRange', () => {
  it('gives whole months, quarters-ish and years for a day', () => {
    expect(presetRange('month', '2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('month', '2028-02-14')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('last-month', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(presetRange('3-months', '2026-10-21')).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(presetRange('3-months', '2026-02-03')).toEqual({ from: '2025-12-01', to: '2026-02-28' });
    expect(presetRange('year', '2026-10-21')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('last-year', '2026-10-21')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('ends a month on its last day across a DST change', () => {
    expect(presetRange('month', '2026-03-29')).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(presetRange('month', '2026-10-25')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('ranges', () => {
  it('names the preset a range is', () => {
    expect(presetOf({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-21')).toBe('month');
    expect(presetOf({ from: '2026-10-02', to: '2026-10-31' }, '2026-10-21')).toBeNull();
  });

  it('counts days with both ends and refuses reversed or over-long ranges', () => {
    expect(rangeDays({ from: '2026-03-28', to: '2026-03-30' })).toBe(3);
    expect(rangeDays({ from: '2026-01-01', to: '2026-12-31' })).toBe(365);
    expect(rangeError({ from: '2026-10-02', to: '2026-10-01' })).toContain('on or after');
    expect(rangeError({ from: '2020-01-01', to: '2026-12-31' })).toContain('five years');
    expect(rangeError({ from: '2022-01-01', to: '2026-12-31' })).toBeNull();
  });

  it('reads the URL range or falls back to this year', () => {
    expect(readRange('2026-09-01', '2026-09-30', '2026-10-21')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    const thisYear = { from: '2026-01-01', to: '2026-12-31' };
    expect(readRange(null, '2026-09-30', '2026-10-21')).toEqual(thisYear);
    expect(readRange('01/09/2026', '2026-09-30', '2026-10-21')).toEqual(thisYear);
    expect(readRange('2026-09-30', '2026-09-01', '2026-10-21')).toEqual(thisYear);
  });
});
