import { addDaysIso } from '../../core/dates/today';
import type {
  KnowledgeNote,
  RoadmapStatus,
  StudySession,
} from '../../core/services/learning.service';
import { daysBetween } from '../dashboard/my-day-view';
import { weekStartIso } from '../journal/journal-days';

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  Active: 'Under way',
  Completed: 'Done',
  Archived: 'Archived',
};

/** "Remind me" choices for a certification's renewal, in days before it expires. */
export const RENEWAL_REMINDER_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "Don't remind me" },
  { days: 7, label: 'A week before' },
  { days: 30, label: 'A month before' },
  { days: 60, label: 'Two months before' },
  { days: 90, label: 'Three months before' },
];

/** Where a note stands in the revision planner, in words: "Due today", "Due 3 days ago", "Next review in 4 days". */
export function reviewText(note: Pick<KnowledgeNote, 'nextReviewOn'>, today: string): string {
  if (!note.nextReviewOn) {
    return 'Not in review';
  }
  const days = daysBetween(today, note.nextReviewOn);
  if (days < 0) {
    return days === -1 ? 'Due since yesterday' : `Due since ${-days} days ago`;
  }
  if (days === 0) {
    return 'Due today';
  }
  return days === 1 ? 'Next review tomorrow' : `Next review in ${days} days`;
}

/** True when a note's review day has come (a missed day stays due). */
export function isDue(note: Pick<KnowledgeNote, 'nextReviewOn'>, today: string): boolean {
  return note.nextReviewOn !== null && note.nextReviewOn <= today;
}

/** Minutes studied this week (Monday to today) and over the last 30 days, from sessions on or before today. */
export function studyTotals(
  sessions: readonly Pick<StudySession, 'studiedOn' | 'minutes'>[],
  today: string,
): { week: number; last30: number } {
  const weekStart = weekStartIso(today);
  const last30Start = addDaysIso(today, -29);
  let week = 0;
  let last30 = 0;
  for (const s of sessions) {
    if (s.studiedOn > today) {
      continue;
    }
    if (s.studiedOn >= weekStart) {
      week += s.minutes;
    }
    if (s.studiedOn >= last30Start) {
      last30 += s.minutes;
    }
  }
  return { week, last30 };
}

/** Sessions grouped by day, newest day first, each with its total; the order inside a day is kept. */
export function sessionsByDay<T extends Pick<StudySession, 'studiedOn' | 'minutes'>>(
  sessions: readonly T[],
): { day: string; minutes: number; sessions: T[] }[] {
  const days = new Map<string, T[]>();
  for (const s of sessions) {
    days.set(s.studiedOn, [...(days.get(s.studiedOn) ?? []), s]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({
      day,
      minutes: list.reduce((sum, s) => sum + s.minutes, 0),
      sessions: list,
    }));
}

/** What a session was about, in one line: "Subjunctive · Spanish", "Angular Signals in depth", "A removed item". */
export function sessionSubject(
  session: Pick<StudySession, 'topic' | 'skillName' | 'courseTitle' | 'bookTitle'>,
): string {
  const parts = [
    session.topic,
    session.courseTitle ?? session.bookTitle ?? session.skillName,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(' · ') : 'Something since removed';
}
