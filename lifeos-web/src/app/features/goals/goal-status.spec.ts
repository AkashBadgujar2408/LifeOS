import { GoalHistoryEntry } from '../../core/services/goals.service';
import { goalStatusActions, historyTitle, revisionSummary } from './goal-status';

const entry = (overrides: Partial<GoalHistoryEntry>): GoalHistoryEntry => ({
  id: 1,
  eventType: 'Revised',
  fromStatus: null,
  toStatus: null,
  changedFields: [],
  previousTargetDate: null,
  newTargetDate: null,
  note: null,
  createdAt: '2026-10-14T10:00:00Z',
  ...overrides,
});

// Stand-in for the app's date formatting, so these tests are about wording, not locale.
const fmt = (isoDate: string) => `<${isoDate}>`;

describe('goalStatusActions', () => {
  it('offers complete, postpone and abandon on an active goal', () => {
    expect(goalStatusActions('Active').map((a) => a.status)).toEqual([
      'Completed',
      'Postponed',
      'Abandoned',
    ]);
  });

  it('offers reactivate (and complete, unless already done) otherwise', () => {
    expect(goalStatusActions('Postponed').map((a) => a.status)).toEqual(['Active', 'Completed']);
    expect(goalStatusActions('Abandoned').map((a) => a.status)).toEqual(['Active', 'Completed']);
    expect(goalStatusActions('Completed').map((a) => a.status)).toEqual(['Active']);
  });
});

describe('historyTitle', () => {
  it('names status changes by where the goal went', () => {
    expect(
      historyTitle(
        entry({ eventType: 'StatusChanged', fromStatus: 'Active', toStatus: 'Postponed' }),
      ),
    ).toBe('Postponed');
    expect(
      historyTitle(
        entry({ eventType: 'StatusChanged', fromStatus: 'Postponed', toStatus: 'Active' }),
      ),
    ).toBe('Reactivated');
    expect(historyTitle(entry({ changedFields: ['Title'] }))).toBe('Revised');
  });
});

describe('revisionSummary', () => {
  it('lists changed fields in plain words', () => {
    expect(revisionSummary(entry({ changedFields: ['Title', 'Tags', 'LifeArea'] }), fmt)).toBe(
      'Changed title, tags, life area',
    );
  });

  it('gives a target date move its own clause', () => {
    const moved = entry({
      changedFields: ['Title', 'TargetDate'],
      previousTargetDate: '2027-06-30',
      newTargetDate: '2027-12-31',
    });
    expect(revisionSummary(moved, fmt)).toBe(
      'Changed title · target date <2027-06-30> → <2027-12-31>',
    );
  });

  it('handles a date-only revision and added or removed dates', () => {
    expect(
      revisionSummary(entry({ changedFields: ['TargetDate'], newTargetDate: '2027-01-01' }), fmt),
    ).toBe('Target date none → <2027-01-01>');
    expect(
      revisionSummary(
        entry({ changedFields: ['TargetDate'], previousTargetDate: '2027-01-01' }),
        fmt,
      ),
    ).toBe('Target date <2027-01-01> → none');
  });
});
