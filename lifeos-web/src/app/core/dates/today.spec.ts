import { addDaysIso, isOverdue, localMidnight, toLocalIsoDate, todayIso } from './today';

// Every calendar date in the app ("yyyy-MM-dd": due dates, habit days, journal days) goes through these. The trap
// they exist to avoid is toISOString(), which gives the UTC date — wrong late in the evening west of UTC and early
// in the morning east of it. These tests use the machine's own timezone, so they hold in any of them.

describe('toLocalIsoDate', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });

  it('keeps the local date at the very start and end of a day', () => {
    expect(toLocalIsoDate(new Date(2026, 9, 15, 0, 0, 0))).toBe('2026-10-15');
    expect(toLocalIsoDate(new Date(2026, 9, 15, 23, 59, 59))).toBe('2026-10-15');
  });
});

describe('addDaysIso', () => {
  it('moves across month and year ends', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('knows leap years', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysIso('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('steps whole calendar days across daylight-saving changes', () => {
    // The EU and US switch dates; a 24-hour step in milliseconds would land on the wrong day in those zones.
    expect(addDaysIso('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysIso('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDaysIso('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDaysIso('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDaysIso('2026-03-01', 30)).toBe('2026-03-31');
  });

  it('is zero-safe and handles large spans', () => {
    expect(addDaysIso('2026-10-15', 0)).toBe('2026-10-15');
    expect(addDaysIso('2026-10-15', 365)).toBe('2027-10-15');
  });
});

describe('localMidnight', () => {
  it('is the start of that local day', () => {
    const midnight = localMidnight('2026-10-15');
    expect([midnight.getFullYear(), midnight.getMonth(), midnight.getDate()]).toEqual([
      2026, 9, 15,
    ]);
    expect([midnight.getHours(), midnight.getMinutes()]).toEqual([0, 0]);
  });

  it('round-trips with toLocalIsoDate', () => {
    for (const day of ['2026-01-01', '2026-03-29', '2026-10-25', '2028-02-29']) {
      expect(toLocalIsoDate(localMidnight(day))).toBe(day);
    }
  });
});

describe('todayIso / isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Late evening, local time: the case toISOString() gets wrong east of UTC... and west of it near midnight.
    vi.setSystemTime(new Date(2026, 9, 15, 23, 30));
  });

  afterEach(() => vi.useRealTimers());

  it('is the local date, even late in the evening', () => {
    expect(todayIso()).toBe('2026-10-15');
  });

  it('is overdue only when open and dated before today', () => {
    expect(isOverdue('2026-10-14', false)).toBe(true);
    expect(isOverdue('2026-10-15', false)).toBe(false);
    expect(isOverdue('2026-10-14', true)).toBe(false);
    expect(isOverdue(null, false)).toBe(false);
  });
});
