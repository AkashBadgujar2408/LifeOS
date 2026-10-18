import { LifeAreaStats } from '../../core/services/story.service';

/**
 * Month keys are the month's first day, "yyyy-MM-01" — the same key story.LifeAreaRatings uses. All the arithmetic here
 * is on the year/month numbers, never a Date, so no timezone can move a month.
 */
export function monthOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(month: string, count: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  const year = Math.floor(index / 12);
  const monthNumber = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-01`;
}

/** The month's last day, "yyyy-MM-dd". */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  // Day 0 of the next month is this month's last day; Date.UTC keeps it zone-free.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;
}

/** The days of `month` the activity bars cover: the whole month, or up to today while it's still running. */
export function activityWindow(month: string, today: string): { from: string; to: string } {
  const end = monthEnd(month);
  return { from: month, to: end < today ? end : today };
}

/** How a rating moved since last month, in words; null when there's nothing to compare. */
export function ratingChange(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) {
    return null;
  }
  const delta = current - previous;
  if (delta === 0) {
    return 'same as last month';
  }
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} from last month`;
}

/** How far into the current level, 0–100 (floored, so a bar never looks full before the level-up). */
export function levelPercent(stats: Pick<LifeAreaStats, 'xpIntoLevel' | 'xpForNextLevel'>): number {
  return stats.xpForNextLevel <= 0
    ? 0
    : Math.floor((stats.xpIntoLevel * 100) / stats.xpForNextLevel);
}

/** What earned the XP: "1 mission passed · 3 objectives · 7 habit days". */
export function statsLine(stats: LifeAreaStats): string {
  const parts = [
    [stats.goalsCompleted, 'mission passed', 'missions passed'],
    [stats.milestonesCompleted, 'objective', 'objectives'],
    [stats.habitDays, 'habit day', 'habit days'],
    [stats.journalEntries, 'journal entry', 'journal entries'],
    [Math.floor(stats.studyMinutes / 60), 'hour studied', 'hours studied'],
  ] as const;
  const text = parts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
    .join(' · ');
  return text || 'Nothing finished here yet';
}
