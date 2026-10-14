/** Today as a local calendar date, "yyyy-MM-dd": comparable as a string with the API's DATE values. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A target date that's passed while the thing is still open. Both sides are "yyyy-MM-dd". */
export function isOverdue(targetDate: string | null, done: boolean): boolean {
  return !done && targetDate !== null && targetDate < todayIso();
}
