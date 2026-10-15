import { Reminder } from '../../core/services/reminders.service';

export interface SnoozePreset {
  label: string;
  /** UTC ISO string. */
  until: string;
}

/**
 * Snooze choices relative to `now`, in local time: an hour from now, this evening at 18:00 (only while that's
 * more than an hour away, or it would barely differ from the first), tomorrow at 09:00.
 */
export function snoozePresets(now: Date): SnoozePreset[] {
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  const presets: SnoozePreset[] = [{ label: 'In 1 hour', until: inAnHour.toISOString() }];

  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  if (evening.getTime() > inAnHour.getTime()) {
    presets.push({ label: 'This evening (18:00)', until: evening.toISOString() });
  }

  const tomorrowMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  presets.push({ label: 'Tomorrow morning (09:00)', until: tomorrowMorning.toISOString() });
  return presets;
}

/** Pending reminders split by whether their moment has come; both keep the API's soonest-first order. */
export function splitPending(
  pending: Reminder[],
  now: Date,
): { due: Reminder[]; upcoming: Reminder[] } {
  const due: Reminder[] = [];
  const upcoming: Reminder[] = [];
  for (const reminder of pending) {
    (new Date(reminder.remindAt).getTime() <= now.getTime() ? due : upcoming).push(reminder);
  }
  return { due, upcoming };
}

/** Default moment for a new reminder: the next whole hour that's at least 30 minutes away. */
export function defaultRemindAt(now: Date): Date {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  if (next.getTime() - now.getTime() < 30 * 60 * 1000) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}
