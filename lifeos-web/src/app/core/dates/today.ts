/** Short weekday names in ISO order (Monday first), matching the en-gb calendar and the habit schedule bits. */
export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** A Date's *local* calendar date, "yyyy-MM-dd" (never via toISOString(), which would give the UTC date). */
export function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today as a local calendar date, "yyyy-MM-dd": comparable as a string with the API's DATE values. */
export function todayIso(): string {
  return toLocalIsoDate(new Date());
}

/** A target date that's passed while the thing is still open. Both sides are "yyyy-MM-dd". */
export function isOverdue(targetDate: string | null, done: boolean): boolean {
  return !done && targetDate !== null && targetDate < todayIso();
}

/** A "yyyy-MM-dd" calendar date moved by whole days, without going through UTC (no DST/timezone shifts). */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return toLocalIsoDate(new Date(year, month - 1, day + days));
}

/** Local midnight at the start of a "yyyy-MM-dd" day, as a Date. */
export function localMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The browser's IANA timezone ("Asia/Kolkata"), for the API calls that need the user's wall clock. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
