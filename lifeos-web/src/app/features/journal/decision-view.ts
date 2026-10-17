import { addDaysIso } from '../../core/dates/today';
import { Decision, DecisionVerdict } from '../../core/services/decisions.service';

export const VERDICTS: readonly { value: DecisionVerdict; label: string; icon: string }[] = [
  { value: 'Better', label: 'Better than expected', icon: 'bi-emoji-smile' },
  { value: 'AsExpected', label: 'As expected', icon: 'bi-emoji-neutral' },
  { value: 'Worse', label: 'Worse than expected', icon: 'bi-emoji-frown' },
];

export function verdictMeta(verdict: DecisionVerdict | string | null) {
  return VERDICTS.find((v) => v.value === verdict) ?? null;
}

export type ReviewState = 'reviewed' | 'due' | 'waiting' | 'open';

/**
 * Where a decision stands on the user's local `today`: its outcome recorded, due for review (the review day has come),
 * waiting for its review day, or open with no review day set.
 */
export function reviewState(
  decision: Pick<Decision, 'reviewOn' | 'reviewedOn'>,
  today: string,
): ReviewState {
  if (decision.reviewedOn) {
    return 'reviewed';
  }
  if (!decision.reviewOn) {
    return 'open';
  }
  return decision.reviewOn <= today ? 'due' : 'waiting';
}

export interface DecisionBuckets {
  /** Review day reached, outcome not recorded — oldest review day first. */
  due: Decision[];
  /** Not reviewed yet: review day ahead (soonest first), then those without one (newest first). */
  waiting: Decision[];
  /** Outcome recorded — most recently reviewed first. */
  reviewed: Decision[];
}

export function decisionBuckets(decisions: readonly Decision[], today: string): DecisionBuckets {
  const byState = (state: ReviewState) => decisions.filter((d) => reviewState(d, today) === state);
  return {
    due: byState('due').sort((a, b) => a.reviewOn!.localeCompare(b.reviewOn!)),
    waiting: [
      ...byState('waiting').sort((a, b) => a.reviewOn!.localeCompare(b.reviewOn!)),
      ...byState('open').sort((a, b) => b.decidedOn.localeCompare(a.decidedOn)),
    ],
    reviewed: byState('reviewed').sort(
      (a, b) =>
        b.reviewedOn!.localeCompare(a.reviewedOn!) || b.decidedOn.localeCompare(a.decidedOn),
    ),
  };
}

/** Quick picks for "look back on it": a few common horizons from the decision day. */
export const REVIEW_AFTER: readonly { label: string; days: number }[] = [
  { label: 'In a month', days: 30 },
  { label: 'In 3 months', days: 91 },
  { label: 'In 6 months', days: 182 },
  { label: 'In a year', days: 365 },
];

export function reviewDayAfter(decidedOn: string, days: number): string {
  return addDaysIso(decidedOn, days);
}
