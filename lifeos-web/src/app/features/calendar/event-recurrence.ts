import { EventRecurrence } from '../../core/services/calendar.service';
import { RecurrenceFrequency } from '../../core/services/tasks.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const UNITS: Record<RecurrenceFrequency, [string, string]> = {
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Yearly: ['year', 'years'],
};

/** The shortest gap between two occurrences, in days — months count as 28, years as 365 (as on the API). */
const MIN_STEP_DAYS: Record<RecurrenceFrequency, number> = {
  Daily: 1,
  Weekly: 7,
  Monthly: 28,
  Yearly: 365,
};

function parts(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.split('-').map(Number);
  return [y, m, d];
}

/** "2026-10-14" → "14/Oct/2026", the app's one date format, without going through a Date. */
export function formatIsoDate(isoDate: string): string {
  const [y, m, d] = parts(isoDate);
  return `${String(d).padStart(2, '0')}/${MONTHS[m - 1]}/${y}`;
}

/** "Tuesday" — computed in UTC so the browser's zone can't move the day. */
export function weekdayName(isoDate: string): string {
  const [y, m, d] = parts(isoDate);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10];
  return `${n}${suffix ?? 'th'}`;
}

/** "every week" / "every 2 weeks". */
export function intervalUnit(frequency: RecurrenceFrequency, interval: number): string {
  const [one, many] = UNITS[frequency];
  return interval === 1 ? one : many;
}

/**
 * "Every 2 weeks on Tuesday, until 15/Dec/2026" — the series in words, anchored on its first occurrence's day.
 * Monthly from the 29th–31st says what happens in shorter months (they clamp, as recurring tasks do).
 */
export function recurrenceSummary(recurrence: EventRecurrence, firstDate: string): string {
  const { frequency, interval, until } = recurrence;
  const every =
    interval === 1 ? `Every ${UNITS[frequency][0]}` : `Every ${interval} ${UNITS[frequency][1]}`;
  const [, m, d] = parts(firstDate);

  let on = '';
  switch (frequency) {
    case 'Weekly':
      on = ` on ${weekdayName(firstDate)}`;
      break;
    case 'Monthly':
      on =
        d > 28
          ? ` on the ${ordinal(d)} (or the last day of shorter months)`
          : ` on the ${ordinal(d)}`;
      break;
    case 'Yearly':
      on = ` on ${d} ${MONTHS[m - 1]}`;
      break;
  }

  return `${every}${on}${until ? `, until ${formatIsoDate(until)}` : ''}`;
}

/** "Remind me before each" choices for a timed repeating event (minutes; null = no reminder). */
export const REMIND_BEFORE_OPTIONS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: "Don't remind me" },
  { minutes: 0, label: 'When it starts' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
];

/** Mirrors EventRecurrence.LengthError on the API: an occurrence may not outlast the gap to the next. */
export function longerThanGap(
  frequency: RecurrenceFrequency,
  interval: number,
  lengthMinutes: number,
): boolean {
  return lengthMinutes > MIN_STEP_DAYS[frequency] * interval * 24 * 60;
}
