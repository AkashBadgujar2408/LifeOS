import { ModuleKey } from '../../core/services/settings.service';
import { GoalOutcome, LearningReachedKind, TaskOutcome } from '../../core/services/reports.service';

/** The report tabs in order, each hidden with its module (null: never hidden). */
export const REPORT_TABS: readonly { path: string; label: string; module: ModuleKey | null }[] = [
  { path: 'goals', label: 'Goals', module: 'Goals' },
  { path: 'habits', label: 'Habits', module: 'Habits' },
  { path: 'productivity', label: 'Productivity', module: 'Tasks' },
  { path: 'learning', label: 'Learning', module: 'Learning' },
  { path: 'health', label: 'Health', module: 'Health' },
  { path: 'money', label: 'Money', module: 'Finance' },
  { path: 'balance', label: 'Life balance', module: null },
];

/** How each goal outcome reads in the report (the API decides which one a goal gets). */
export const GOAL_OUTCOME_LABELS: Record<GoalOutcome, string> = {
  OnTime: 'Completed on time',
  Late: 'Completed late',
  NoTarget: 'Completed (no target date)',
  Abandoned: 'Abandoned',
  Missed: 'Missed its target date',
  InProgress: 'Still going',
};

/** How each task outcome reads in the productivity report (one per task, decided by the API). */
export const TASK_OUTCOME_LABELS: Record<TaskOutcome, string> = {
  OnTime: 'Done on time',
  Late: 'Done late',
  NoDueDate: 'Done (no due date)',
  Overdue: 'Not done by its due date',
};

/** What was reached, in words, and the item type that opens it (EntityOpener). */
export const LEARNING_REACHED: Record<LearningReachedKind, { label: string; entityType: string }> =
  {
    CourseCompleted: { label: 'Course completed', entityType: 'Course' },
    BookFinished: { label: 'Book finished', entityType: 'MediaItem' },
    SkillLevelUp: { label: 'Skill level up', entityType: 'Skill' },
    Certification: { label: 'Certification', entityType: 'Certification' },
  };

/** "67%", or "—" when there's nothing to divide by. */
export function percentText(percent: number | null): string {
  return percent === null ? '—' : `${percent}%`;
}

/** "3 days" / "1 day". */
export function daysText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "3.4", or "—" for an average nobody gave a value for. */
export function averageText(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** Minutes as hours for a chart's bars (one decimal). */
export function hours(minutes: number | null): number | null {
  return minutes === null ? null : Math.round((minutes / 60) * 10) / 10;
}
