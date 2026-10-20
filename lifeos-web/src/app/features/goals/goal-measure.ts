import type { GoalSourceKind, ProgressKind } from '../../core/services/goals.service';

/**
 * Showing measured goals (Sessions 71d–71h): "40,000 of 1,00,000 steps". The figures themselves are always the
 * API's (GoalProgress) — nothing here works out progress.
 */

/** A count or amount the way the rest of LifeOS writes numbers (Indian grouping, up to 2 decimals). */
export function formatAmount(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** "40,000 of 1,00,000 steps", or "1,00,000 steps" when where it stands isn't known (locked). */
export function measureLine(current: number | null, target: number, unit: string): string {
  return current === null
    ? `${formatAmount(target)} ${unit}`
    : `${formatAmount(current)} of ${formatAmount(target)} ${unit}`;
}

/** What a goal card needs to show its progress (the goals list, My Day). */
export interface ProgressFields {
  /** Left out on My Day, which shows active goals only. */
  status?: string;
  progressKind: ProgressKind;
  progressPercent: number;
  progressLocked: boolean;
  milestoneCount: number;
  completedMilestoneCount: number;
  measureCurrent: number | null;
  measureTarget: number | null;
  measureUnit: string | null;
}

/** What the % is of, in a few words: "40,000 of 1,00,000 steps", "3 of 5 milestones". */
export function progressCaption(goal: ProgressFields): string {
  switch (goal.progressKind) {
    case 'Measure':
      return measureLine(goal.measureCurrent, goal.measureTarget!, goal.measureUnit!);
    case 'Savings':
      return 'Money saved';
    case 'Body':
      return 'Body measurement';
    default:
      return `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones`;
  }
}

/** A bar is worth drawing once there's something to measure against (and the figure isn't locked). */
export function hasProgressBar(goal: ProgressFields): boolean {
  if (goal.progressLocked) {
    return false;
  }
  return (
    goal.progressKind !== 'Milestones' || goal.milestoneCount > 0 || goal.status === 'Completed'
  );
}

/** Group headings in the source picker. */
export const SOURCE_KIND_LABELS: Record<GoalSourceKind, string> = {
  Habit: 'Habits',
  StudyTime: 'Study time',
  BooksFinished: 'Books finished',
  CoursesCompleted: 'Courses completed',
  Roadmap: 'Roadmaps',
  ProjectTasks: 'Tasks done in a project',
  ProjectFocus: 'Focus time on a project',
  Workouts: 'Workouts',
};

/** Same rule as the API's GoalMeasureRules.SameUnit: "Steps" and " steps " match, "pages" and "steps" don't. */
export function sameUnit(a: string | null, b: string | null): boolean {
  const clean = (unit: string | null) => (unit ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return clean(a) === clean(b);
}

/** How a goal can be measured — the goal form's one picker. */
export type MeasureChoice = 'Milestones' | 'Manual' | 'Linked' | 'Savings';

export const MEASURE_CHOICES: readonly { value: MeasureChoice; label: string; hint: string }[] = [
  {
    value: 'Milestones',
    label: 'Milestones',
    hint: 'Progress is the share of milestones ticked.',
  },
  {
    value: 'Manual',
    label: 'A number I log',
    hint: 'Set a target like 1,00,000 steps or 2,000 pages and log what you do.',
  },
  {
    value: 'Linked',
    label: 'A number counted for me',
    hint: 'Counted from habits, study time, books, courses, roadmaps or projects — you choose them on the goal page.',
  },
  {
    value: 'Savings',
    label: 'Money saved',
    hint: 'An amount to reach, counted from the accounts and investments you link.',
  },
];
