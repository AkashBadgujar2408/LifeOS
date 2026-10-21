import { GoalOutcome } from '../../core/services/reports.service';

/** How each goal outcome reads in the report (the API decides which one a goal gets). */
export const GOAL_OUTCOME_LABELS: Record<GoalOutcome, string> = {
  OnTime: 'Completed on time',
  Late: 'Completed late',
  NoTarget: 'Completed (no target date)',
  Abandoned: 'Abandoned',
  Missed: 'Missed its target date',
  InProgress: 'Still going',
};

/** "67%", or "—" when there's nothing to divide by. */
export function percentText(percent: number | null): string {
  return percent === null ? '—' : `${percent}%`;
}

/** "3 days" / "1 day". */
export function daysText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
