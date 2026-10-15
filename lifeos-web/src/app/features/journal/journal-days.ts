import { addDaysIso, localMidnight } from '../../core/dates/today';
import { Mood, MoodPoint } from '../../core/services/journal.service';

export interface MoodMeta {
  value: Mood;
  label: string;
  icon: string;
}

/** The 1-5 scale's words and faces. The API stores only the number. */
export const MOODS: readonly MoodMeta[] = [
  { value: 1, label: 'Awful', icon: 'bi-emoji-tear' },
  { value: 2, label: 'Low', icon: 'bi-emoji-frown' },
  { value: 3, label: 'Okay', icon: 'bi-emoji-neutral' },
  { value: 4, label: 'Good', icon: 'bi-emoji-smile' },
  { value: 5, label: 'Great', icon: 'bi-emoji-laughing' },
];

export function moodMeta(mood: Mood): MoodMeta {
  return MOODS[mood - 1];
}

/** The Monday of the week containing a "yyyy-MM-dd" day (ISO weeks, same as JournalWeeks.WeekStart). */
export function weekStartIso(isoDate: string): string {
  const isoWeekday = (localMidnight(isoDate).getDay() + 6) % 7; // Monday -> 0 ... Sunday -> 6
  return addDaysIso(isoDate, -isoWeekday);
}

/** A trend's x axis: every day from `from` to `to`, with the mood or null where none was recorded. */
export function moodSeries(
  points: readonly MoodPoint[],
  from: string,
  to: string,
): { day: string; mood: Mood | null }[] {
  const byDay = new Map(points.map((point) => [point.entryDate, point.mood]));
  const days: { day: string; mood: Mood | null }[] = [];
  for (let day = from; day <= to; day = addDaysIso(day, 1)) {
    days.push({ day, mood: byDay.get(day) ?? null });
  }
  return days;
}

/** Average mood to one decimal, or null when there are no moods. */
export function averageMood(moods: readonly (Mood | null)[]): number | null {
  const recorded = moods.filter((mood): mood is Mood => mood !== null);
  if (recorded.length === 0) {
    return null;
  }
  const average = recorded.reduce((sum, mood) => sum + mood, 0) / recorded.length;
  return Math.round(average * 10) / 10;
}
