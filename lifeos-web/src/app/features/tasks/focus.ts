/** Pure helpers for the focus (Pomodoro) timer. */

/** Session lengths the timer offers, in minutes; 25 is the classic Pomodoro. */
export const FOCUS_LENGTHS = [15, 25, 50] as const;

/** 1500 → "25:00", 59 → "00:59", 3725 → "62:05" (minutes can pass 59). */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * The minutes a stretch of focus is worth logging as: whole minutes, rounded to the nearest (so 24:40 is 25), and
 * nothing under a minute — a timer started by mistake isn't a session.
 */
export function sessionMinutes(focusedSeconds: number): number {
  return focusedSeconds < 60 ? 0 : Math.min(600, Math.round(focusedSeconds / 60));
}

/**
 * Focus time so far: the finished stretches (`banked`) plus the one running since `runningSince` (ms), if any. Wall
 * clock based, so a throttled background tab still counts the right time.
 */
export function focusedSeconds(banked: number, runningSince: number | null, now: number): number {
  return banked + (runningSince === null ? 0 : Math.max(0, (now - runningSince) / 1000));
}

/** "45m of 1h" / "45m" / "1h estimated" — the task's estimated vs actual, null when there's neither. */
export function timeVersusEstimate(
  actualMinutes: number,
  estimateMinutes: number | null,
  format: (minutes: number) => string,
): string | null {
  if (estimateMinutes === null) {
    return actualMinutes > 0 ? format(actualMinutes) : null;
  }
  return actualMinutes > 0
    ? `${format(actualMinutes)} of ${format(estimateMinutes)}`
    : `${format(estimateMinutes)} estimated`;
}
