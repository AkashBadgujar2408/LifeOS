import {
  EVERY_DAY,
  WEEKDAYS,
  canToggle,
  dayState,
  daysEnding,
  isScheduled,
  isoWeekdayIndex,
  scheduleLabel,
} from './habit-schedule';

// 2026-10-12 is a Monday, 2026-10-15 (the "today" used below) a Thursday.
const MON_WED_FRI = 1 | 4 | 16;

describe('isoWeekdayIndex / isScheduled', () => {
  it('counts Monday as 0 and Sunday as 6', () => {
    expect(isoWeekdayIndex('2026-10-12')).toBe(0);
    expect(isoWeekdayIndex('2026-10-18')).toBe(6);
  });

  it('tests the weekday bit like the API does', () => {
    expect(isScheduled(MON_WED_FRI, '2026-10-12')).toBe(true);
    expect(isScheduled(MON_WED_FRI, '2026-10-13')).toBe(false);
    expect(isScheduled(64, '2026-10-18')).toBe(true);
    expect(isScheduled(EVERY_DAY, '2026-10-17')).toBe(true);
  });
});

describe('scheduleLabel', () => {
  it('names the common schedules', () => {
    expect(scheduleLabel(EVERY_DAY)).toBe('Every day');
    expect(scheduleLabel(WEEKDAYS)).toBe('Weekdays');
    expect(scheduleLabel(96)).toBe('Weekends');
  });

  it('lists the days otherwise, Monday first', () => {
    expect(scheduleLabel(MON_WED_FRI)).toBe('Mon, Wed, Fri');
    expect(scheduleLabel(64 | 1)).toBe('Mon, Sun');
  });
});

describe('daysEnding', () => {
  it('returns the days up to and including the last one, oldest first, across a month end', () => {
    expect(daysEnding('2026-11-02', 4)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});

describe('dayState', () => {
  const today = '2026-10-15';
  const done = new Set(['2026-10-12', '2026-10-13']);

  it('marks ticked days done, even off schedule (so they can be un-ticked)', () => {
    expect(dayState(EVERY_DAY, '2026-10-01', done, '2026-10-12', today)).toBe('done');
    expect(dayState(MON_WED_FRI, '2026-10-01', done, '2026-10-13', today)).toBe('done');
  });

  it('treats today as open, not missed, until the day is over', () => {
    expect(dayState(EVERY_DAY, '2026-10-01', done, today, today)).toBe('open');
    expect(dayState(EVERY_DAY, '2026-10-01', done, '2026-10-14', today)).toBe('missed');
  });

  it('separates off-schedule, before-start and future days', () => {
    expect(dayState(MON_WED_FRI, '2026-10-01', done, '2026-10-15', today)).toBe('off');
    expect(dayState(EVERY_DAY, '2026-10-14', done, '2026-10-11', today)).toBe('notStarted');
    expect(dayState(EVERY_DAY, '2026-10-01', done, '2026-10-16', today)).toBe('future');
  });

  it('only lets real days be toggled', () => {
    expect(canToggle('done')).toBe(true);
    expect(canToggle('open')).toBe(true);
    expect(canToggle('missed')).toBe(true);
    expect(canToggle('off')).toBe(false);
    expect(canToggle('notStarted')).toBe(false);
    expect(canToggle('future')).toBe(false);
  });
});
