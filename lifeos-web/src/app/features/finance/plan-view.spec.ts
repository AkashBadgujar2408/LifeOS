import type { RetirementProjection } from '../../core/services/finance.service';
import { retirementGap, retirementVerdict } from './plan-view';

const projection = (
  ageReached: number | null,
  projected = 100,
  needed = 120,
): RetirementProjection => ({
  yearsToRetirement: 30,
  monthlySpendingAtRetirement: 0,
  corpusNeeded: needed,
  ruleOf25: 0,
  projectedCorpus: projected,
  ageReached,
  points: [],
});

describe('plan view', () => {
  it('says whether retirement is on course', () => {
    expect(retirementVerdict(projection(60), 60)).toBe('On track to have enough by 60.');
    expect(retirementVerdict(projection(57), 60)).toBe(
      'On track — you could have enough by 57, before 60.',
    );
    expect(retirementVerdict(projection(61), 60)).toBe(
      "You'd have enough by 61 — 1 year after 60.",
    );
    expect(retirementVerdict(projection(null), 60)).toContain('not by 100');
  });

  it('works out the gap or the surplus at retirement', () => {
    expect(retirementGap(projection(61, 100, 120.5))).toBe(-20.5);
    expect(retirementGap(projection(55, 150, 120))).toBe(30);
  });
});
