import type { RetirementProjection, SavingsPlanStatus } from '../../core/services/finance.service';

export const SAVINGS_STATUS_LABELS: Record<SavingsPlanStatus, string> = {
  Reached: 'Reached',
  OnTrack: 'On track',
  Behind: 'Behind',
  NoDate: 'No target date',
  Overdue: 'Past its date',
};

/**
 * The retirement verdict in one sentence: on track for the age chosen, a few years late, or not by 100.
 */
export function retirementVerdict(r: RetirementProjection, retirementAge: number): string {
  if (r.ageReached === null) {
    return 'At this rate the projection never catches up with what you would need — not by 100.';
  }
  if (r.ageReached <= retirementAge) {
    return r.ageReached < retirementAge
      ? `On track — you could have enough by ${r.ageReached}, before ${retirementAge}.`
      : `On track to have enough by ${retirementAge}.`;
  }
  const late = r.ageReached - retirementAge;
  return `You'd have enough by ${r.ageReached} — ${late} year${late === 1 ? '' : 's'} after ${retirementAge}.`;
}

/** How far the projection is from what's needed at retirement: positive = a surplus, negative = a gap. */
export function retirementGap(r: RetirementProjection): number {
  return Math.round((r.projectedCorpus - r.corpusNeeded) * 100) / 100;
}
