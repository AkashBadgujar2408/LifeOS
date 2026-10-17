import { WEEKDAY_NAMES, addDaysIso, localMidnight } from '../../core/dates/today';
import { Habit, HabitEntryResult } from '../../core/services/habits.service';

/** Every day of the week: the API's default schedule (HabitStreaks.EveryDay). */
export const EVERY_DAY = 127;

/** Monday to Friday. */
export const WEEKDAYS = 31;

/** ISO order, matching the bitmask: bit 0 is Monday ... bit 6 is Sunday. */
export { WEEKDAY_NAMES };

/** 0 = Monday ... 6 = Sunday for a "yyyy-MM-dd" day (JavaScript's getDay() has Sunday = 0). */
export function isoWeekdayIndex(isoDate: string): number {
  return (localMidnight(isoDate).getDay() + 6) % 7;
}

/** Whether the habit is due on that day. Same rule as HabitStreaks.IsScheduled on the API. */
export function isScheduled(scheduleDays: number, isoDate: string): boolean {
  return (scheduleDays & (1 << isoWeekdayIndex(isoDate))) !== 0;
}

/** "Every day", "Weekdays", "Weekends", or the days themselves: "Mon, Wed, Fri". */
export function scheduleLabel(scheduleDays: number): string {
  if (scheduleDays === EVERY_DAY) {
    return 'Every day';
  }
  if (scheduleDays === WEEKDAYS) {
    return 'Weekdays';
  }
  if (scheduleDays === 96) {
    return 'Weekends';
  }
  return WEEKDAY_NAMES.filter((_, index) => (scheduleDays & (1 << index)) !== 0).join(', ');
}

/** The `count` days ending at `lastDay`, oldest first, "yyyy-MM-dd". */
export function daysEnding(lastDay: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDaysIso(lastDay, index - count + 1));
}

/**
 * What one grid cell can be for a habit on a day. `partial` is a measurable day logged short of its target; `clean`
 * and `slipped` are an avoid habit's days.
 */
export type HabitDayState =
  'done' | 'partial' | 'open' | 'missed' | 'off' | 'notStarted' | 'future' | 'clean' | 'slipped';

/**
 * How a day looks on the check-off grid. `open` is today, scheduled and not done yet — not a miss. `off` is a day
 * the schedule skips. A day ticked before the schedule or start date changed still shows as done, so it can be
 * un-ticked (it no longer counts towards the streak either way).
 */
export function dayState(
  scheduleDays: number,
  startDate: string,
  doneDates: ReadonlySet<string>,
  day: string,
  today: string,
): HabitDayState {
  if (day > today) {
    return 'future';
  }
  if (doneDates.has(day)) {
    return 'done';
  }
  if (day < startDate) {
    return 'notStarted';
  }
  if (!isScheduled(scheduleDays, day)) {
    return 'off';
  }
  return day === today ? 'open' : 'missed';
}

/**
 * How a day looks for any habit: an avoid habit's days are clean or slipped (it runs every day, today included once
 * it's begun); a measurable day logged short of its target is `partial`; otherwise as `dayState`.
 */
export function habitDayState(
  habit: Pick<Habit, 'kind' | 'scheduleDays' | 'startDate' | 'doneDates' | 'values' | 'slipDates'>,
  day: string,
  today: string,
): HabitDayState {
  if (habit.kind === 'Avoid') {
    if (day > today) {
      return 'future';
    }
    if (habit.slipDates.includes(day)) {
      return 'slipped';
    }
    return day < habit.startDate ? 'notStarted' : 'clean';
  }
  const state = dayState(habit.scheduleDays, habit.startDate, new Set(habit.doneDates), day, today);
  return (state === 'open' || state === 'missed') && habit.values[day] !== undefined
    ? 'partial'
    : state;
}

/** Only these can be clicked: the API rejects ticks in the future, before the start and off schedule. */
export function canToggle(state: HabitDayState): boolean {
  return (
    state === 'done' ||
    state === 'partial' ||
    state === 'open' ||
    state === 'missed' ||
    state === 'clean' ||
    state === 'slipped'
  );
}

/** The habit after one day was logged or cleared: the day's done / value / slip, and the API's new figures. */
export function applyEntry(habit: Habit, result: HabitEntryResult): Habit {
  const day = result.entryDate;
  if (habit.kind === 'Avoid') {
    const others = habit.slipDates.filter((d) => d !== day);
    return {
      ...habit,
      cleanRun: result.cleanRun,
      slipDates: result.done ? [...others, day].sort() : others,
    };
  }
  const others = habit.doneDates.filter((d) => d !== day);
  const values = { ...habit.values };
  if (result.value === null) {
    delete values[day];
  } else {
    values[day] = result.value;
  }
  return {
    ...habit,
    streak: result.streak,
    doneDates: result.done ? [...others, day].sort() : others,
    values: habit.targetValue === null ? habit.values : values,
  };
}

/** 20 → "20", 12.5 → "12.5" — values as people write them, no trailing zeros. */
export function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** "20 pages", "8 glasses", or just "20" without a unit. */
export function targetLabel(habit: Pick<Habit, 'targetValue' | 'unit'>): string | null {
  return habit.targetValue === null
    ? null
    : [formatAmount(habit.targetValue), habit.unit].filter(Boolean).join(' ');
}
