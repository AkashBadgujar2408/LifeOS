import { Mission, StoryRecap } from '../../core/services/story.service';
import { recapLines } from './narration-lines';

const day = (iso: string) => `day(${iso})`;
const dayMonth = (iso: string) => `dm(${iso})`;

function mission(overrides: Partial<Mission>): Mission {
  return {
    id: 4,
    title: 'Run a half marathon',
    kind: 'Main',
    status: 'Active',
    lifeAreaName: 'Health',
    targetDate: '2027-03-31',
    createdAt: '2026-01-02T00:00:00Z',
    completedAt: null,
    progressPercent: 40,
    progressLocked: false,
    progressKind: 'Milestones',
    objectives: [
      { id: 1, title: 'Run 10 km', done: true, targetDate: null },
      { id: 2, title: 'Run 15 km', done: false, targetDate: null },
    ],
    prerequisites: [],
    blockedBy: [],
    unlocks: [],
    isLocked: false,
    hasDebrief: false,
    ...overrides,
  };
}

const recap: StoryRecap = {
  chapter: {
    id: 1,
    title: 'Starting over',
    summary: 'Never shown on the card',
    startDate: '2026-01-01',
    endDate: null,
    isCurrent: true,
  },
  chapterNumber: 2,
  recentBeats: [
    {
      kind: 'MissionPassed',
      day: '2026-10-21',
      at: null,
      title: 'Learn to swim',
      detail: 'A private debrief',
      note: null,
      advice: null,
      missionKind: 'Side',
      lifeAreaName: null,
      mood: null,
      fromDate: null,
      toDate: null,
      entityType: 'Goal',
      entityId: 3,
      parentTitle: null,
    },
  ],
  currentMission: mission({}),
};

describe('recapLines', () => {
  it('says what the card shows, in its words, and nothing it hides', () => {
    expect(recapLines(recap, day, dayMonth)).toEqual([
      'Current chapter 2: Starting over (since day(2026-01-01))',
      'Lately, dm(2026-10-21): Mission passed: Learn to swim',
      'Up next, Main mission: Run a half marathon, by day(2027-03-31), 40% of the way; next: Run 15 km',
    ]);
  });

  it('leaves out progress the card hides: locked, or no objectives to count', () => {
    const locked = recapLines(
      { ...recap, currentMission: mission({ progressLocked: true, progressKind: 'Body' }) },
      day,
      dayMonth,
    );
    expect(locked.at(-1)).toBe('Up next, Main mission: Run a half marathon, by day(2027-03-31)');
    const none = recapLines(
      { ...recap, currentMission: mission({ objectives: [], targetDate: null }) },
      day,
      dayMonth,
    );
    expect(none.at(-1)).toBe('Up next, Main mission: Run a half marathon');
  });

  it('is empty when there is nothing to recap', () => {
    expect(
      recapLines(
        { chapter: null, chapterNumber: null, recentBeats: [], currentMission: null },
        day,
        dayMonth,
      ),
    ).toEqual([]);
  });
});
