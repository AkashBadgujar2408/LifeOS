import { describe, expect, it } from 'vitest';
import { Decision } from '../../core/services/decisions.service';
import { decisionBuckets, reviewDayAfter, reviewState } from './decision-view';

function decision(id: number, fields: Partial<Decision>): Decision {
  return {
    id,
    decidedOn: '2026-10-01',
    title: `Decision ${id}`,
    reasons: null,
    expectedOutcome: null,
    reviewOn: null,
    reviewReminderId: null,
    actualOutcome: null,
    verdict: null,
    reviewedOn: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: null,
    ...fields,
  };
}

describe('reviewState', () => {
  it('is due on the review day itself, not before', () => {
    expect(reviewState({ reviewOn: '2026-10-17', reviewedOn: null }, '2026-10-16')).toBe('waiting');
    expect(reviewState({ reviewOn: '2026-10-17', reviewedOn: null }, '2026-10-17')).toBe('due');
  });

  it('is reviewed once the outcome is recorded, whatever the review day', () => {
    expect(reviewState({ reviewOn: '2026-12-01', reviewedOn: '2026-10-17' }, '2026-10-17')).toBe(
      'reviewed',
    );
  });

  it('is open without a review day', () => {
    expect(reviewState({ reviewOn: null, reviewedOn: null }, '2026-10-17')).toBe('open');
  });
});

describe('decisionBuckets', () => {
  it('orders each bucket the way it is read', () => {
    const buckets = decisionBuckets(
      [
        decision(1, { reviewOn: '2026-10-10' }),
        decision(2, { reviewOn: '2026-10-05' }),
        decision(3, { reviewOn: '2026-12-01' }),
        decision(4, { reviewOn: '2026-11-01' }),
        decision(5, { decidedOn: '2026-09-01' }),
        decision(6, { decidedOn: '2026-10-02' }),
        decision(7, { reviewOn: '2026-10-01', reviewedOn: '2026-10-03', actualOutcome: 'ok' }),
        decision(8, { reviewOn: '2026-10-01', reviewedOn: '2026-10-09', actualOutcome: 'ok' }),
      ],
      '2026-10-17',
    );

    expect(buckets.due.map((d) => d.id)).toEqual([2, 1]);
    expect(buckets.waiting.map((d) => d.id)).toEqual([4, 3, 6, 5]);
    expect(buckets.reviewed.map((d) => d.id)).toEqual([8, 7]);
  });
});

describe('reviewDayAfter', () => {
  it('counts calendar days from the decision, across month ends', () => {
    expect(reviewDayAfter('2026-10-17', 30)).toBe('2026-11-16');
    expect(reviewDayAfter('2026-01-31', 30)).toBe('2026-03-02');
  });
});
