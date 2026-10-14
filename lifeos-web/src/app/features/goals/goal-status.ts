import { GoalHistoryEntry, GoalStatus } from '../../core/services/goals.service';

export interface GoalStatusMeta {
  label: string;
  icon: string;
  /** Text color utility for the icon. */
  tone: string;
}

export const GOAL_STATUS_META: Record<GoalStatus, GoalStatusMeta> = {
  Active: { label: 'Active', icon: 'bi-play-circle', tone: 'text-primary' },
  Completed: { label: 'Completed', icon: 'bi-check-circle-fill', tone: 'text-success' },
  Postponed: { label: 'Postponed', icon: 'bi-pause-circle', tone: 'text-warning' },
  Abandoned: { label: 'Abandoned', icon: 'bi-x-circle', tone: 'text-body-secondary' },
};

/** One button in the goal's Status card, plus the wording of the confirm dialog it opens. */
export interface GoalStatusAction {
  status: GoalStatus;
  label: string;
  primary: boolean;
  dialogTitle: string;
  notePlaceholder: string;
}

const COMPLETE: GoalStatusAction = {
  status: 'Completed',
  label: 'Mark completed',
  primary: true,
  dialogTitle: 'Mark this goal completed?',
  notePlaceholder: 'How did it go? (optional)',
};

/** The moves that make sense from each status. Revising (editing) is always available separately. */
export function goalStatusActions(status: GoalStatus): GoalStatusAction[] {
  if (status === 'Active') {
    return [
      COMPLETE,
      {
        status: 'Postponed',
        label: 'Postpone',
        primary: false,
        dialogTitle: 'Postpone this goal?',
        notePlaceholder: 'Why now, and when might you pick it up? (optional)',
      },
      {
        status: 'Abandoned',
        label: 'Abandon',
        primary: false,
        dialogTitle: 'Let this goal go?',
        notePlaceholder: 'What changed? (optional)',
      },
    ];
  }

  const reactivate: GoalStatusAction = {
    status: 'Active',
    label: 'Reactivate',
    primary: true,
    dialogTitle: 'Make this goal active again?',
    notePlaceholder: 'What brought it back? (optional)',
  };
  return status === 'Completed' ? [reactivate] : [reactivate, { ...COMPLETE, primary: false }];
}

export function historyTitle(entry: GoalHistoryEntry): string {
  if (entry.eventType === 'Revised') {
    return 'Revised';
  }

  return entry.toStatus === 'Active' ? 'Reactivated' : GOAL_STATUS_META[entry.toStatus!].label;
}

const FIELD_LABELS: Record<string, string> = {
  Title: 'title',
  Description: 'description',
  LifeArea: 'life area',
  GoalType: 'kind of goal',
  Tags: 'tags',
};

/**
 * "Changed title, tags · target date 30/Jun/2027 → 31/Dec/2027". The date move gets its own clause because
 * pushing a deadline is the revision worth seeing at a glance.
 */
export function revisionSummary(
  entry: GoalHistoryEntry,
  formatDate: (isoDate: string) => string,
): string {
  const parts: string[] = [];
  const otherFields = entry.changedFields
    .filter((field) => field !== 'TargetDate')
    .map((field) => FIELD_LABELS[field] ?? field);
  if (otherFields.length > 0) {
    parts.push(`Changed ${otherFields.join(', ')}`);
  }

  if (entry.changedFields.includes('TargetDate')) {
    const from = entry.previousTargetDate ? formatDate(entry.previousTargetDate) : 'none';
    const to = entry.newTargetDate ? formatDate(entry.newTargetDate) : 'none';
    parts.push(`${parts.length === 0 ? 'Target date' : 'target date'} ${from} → ${to}`);
  }

  return parts.join(' · ');
}
