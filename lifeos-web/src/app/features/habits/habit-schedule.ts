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

/** What one grid cell can be for a habit on a day. */
export type HabitDayState = 'done' | 'open' | 'missed' | 'off' | 'notStarted' | 'future';

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

/** Only these can be clicked: the API rejects ticks in the future, before the start and off schedule. */
export function canToggle(state: HabitDayState): boolean {
  return state === 'done' || state === 'open' || state === 'missed';
}

/** The habit after one day was ticked or un-ticked: that day in or out of its done days, and the API's new streak. */
export function applyEntry(habit: Habit, result: HabitEntryResult): Habit {
  const others = habit.doneDates.filter((day) => day !== result.entryDate);
  return {
    ...habit,
    streak: result.streak,
    doneDates: result.done ? [...others, result.entryDate].sort() : others,
  };
}
