import { addDaysIso } from '../../core/dates/today';
import { Habit } from '../../core/services/habits.service';
import {
  HabitDayState,
  WEEKDAY_NAMES,
  habitDayState,
  isScheduled,
  isoWeekdayIndex,
} from './habit-schedule';

/** Weeks the year heatmap shows (Monday-aligned, ending with this week): 53 covers a full year. */
export const HEATMAP_WEEKS = 53;

/** The heatmap's first day: the Monday HEATMAP_WEEKS − 1 weeks before this week's. */
export function heatmapStart(today: string): string {
  const thisMonday = addDaysIso(today, -isoWeekdayIndex(today));
  return addDaysIso(thisMonday, -7 * (HEATMAP_WEEKS - 1));
}

/** Week columns of the year, each Monday to Sunday, with each day's state; a month label on a column whose week starts a month. */
export function yearGrid(
  habit: Habit,
  today: string,
): { monday: string; monthLabel: string | null; days: { day: string; state: HabitDayState }[] }[] {
  const start = heatmapStart(today);
  return Array.from({ length: HEATMAP_WEEKS }, (_, week) => {
    const monday = addDaysIso(start, week * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDaysIso(monday, i);
      return { day, state: habitDayState(habit, day, today) };
    });
    // Label the column holding the 1st of a month (or the very first column).
    const first = days.find((d) => d.day.endsWith('-01'));
    const labelDay = week === 0 ? monday : first?.day;
    return {
      monday,
      monthLabel: labelDay ? MONTH_SHORT[Number(labelDay.slice(5, 7)) - 1] : null,
      days,
    };
  });
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface WeekdayConsistency {
  weekday: string;
  /** Build: scheduled days that have passed (today included once done). Avoid: days that have passed. */
  total: number;
  /** Build: of those, done. Avoid: of those, clean. */
  good: number;
  /** good / total as a whole percent; null when the weekday has no days yet. */
  percent: number | null;
}

/**
 * How reliably each weekday goes, over the loaded window (`from` to `today`, from the habit's start): for a build
 * habit the share of scheduled days done, for an avoid habit the share of clean days. Today only counts once it's
 * done (build) — an unfinished today isn't a miss.
 */
export function weekdayConsistency(
  habit: Habit,
  from: string,
  today: string,
): WeekdayConsistency[] {
  const totals = WEEKDAY_NAMES.map((weekday) => ({ weekday, total: 0, good: 0 }));
  const done = new Set(habit.doneDates);
  const slips = new Set(habit.slipDates);
  const first = from > habit.startDate ? from : habit.startDate;
  for (let day = first; day <= today; day = addDaysIso(day, 1)) {
    const slot = totals[isoWeekdayIndex(day)];
    if (habit.kind === 'Avoid') {
      slot.total++;
      if (!slips.has(day)) {
        slot.good++;
      }
      continue;
    }
    if (!isScheduled(habit.scheduleDays, day) || (day === today && !done.has(day))) {
      continue;
    }
    slot.total++;
    if (done.has(day)) {
      slot.good++;
    }
  }
  return totals.map((t) => ({
    ...t,
    percent: t.total === 0 ? null : Math.round((100 * t.good) / t.total),
  }));
}
