import { formatIsoDate, longerThanGap, recurrenceSummary, weekdayName } from './event-recurrence';

describe('recurrenceSummary', () => {
  it('names the weekday for weekly series', () => {
    expect(recurrenceSummary({ frequency: 'Weekly', interval: 1, until: null }, '2026-10-20')).toBe(
      'Every week on Tuesday',
    );
    expect(recurrenceSummary({ frequency: 'Weekly', interval: 2, until: null }, '2026-10-25')).toBe(
      'Every 2 weeks on Sunday',
    );
  });

  it('says how short months are handled from the 29th on', () => {
    expect(
      recurrenceSummary({ frequency: 'Monthly', interval: 1, until: null }, '2026-10-02'),
    ).toBe('Every month on the 2nd');
    expect(
      recurrenceSummary({ frequency: 'Monthly', interval: 3, until: null }, '2026-01-31'),
    ).toBe('Every 3 months on the 31st (or the last day of shorter months)');
    expect(
      recurrenceSummary({ frequency: 'Monthly', interval: 1, until: null }, '2026-01-11'),
    ).toBe('Every month on the 11th');
  });

  it('gives the day and month for yearly series and the end date when there is one', () => {
    expect(
      recurrenceSummary({ frequency: 'Yearly', interval: 1, until: '2030-03-12' }, '1990-03-12'),
    ).toBe('Every year on 12 Mar, until 12/Mar/2030');
    expect(recurrenceSummary({ frequency: 'Daily', interval: 1, until: null }, '2026-10-20')).toBe(
      'Every day',
    );
  });
});

describe('date words', () => {
  it('formats and names days without the browser zone moving them', () => {
    expect(formatIsoDate('2026-03-08')).toBe('08/Mar/2026');
    expect(weekdayName('2026-03-08')).toBe('Sunday');
    expect(weekdayName('2026-11-01')).toBe('Sunday');
  });
});

describe('longerThanGap', () => {
  it('lets an occurrence fill its gap but not overflow it', () => {
    expect(longerThanGap('Daily', 1, 24 * 60)).toBe(false);
    expect(longerThanGap('Daily', 1, 24 * 60 + 5)).toBe(true);
    expect(longerThanGap('Weekly', 1, 3 * 24 * 60)).toBe(false);
    expect(longerThanGap('Monthly', 1, 29 * 24 * 60)).toBe(true);
  });
});
