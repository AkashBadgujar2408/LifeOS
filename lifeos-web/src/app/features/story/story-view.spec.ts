import { StoryBeat, StorySection } from '../../core/services/story.service';
import { beatLink, beatText, chapterLength, gapHeading } from './story-view';

function beat(overrides: Partial<StoryBeat>): StoryBeat {
  return {
    kind: 'GoalStarted',
    day: '2026-10-15',
    at: null,
    title: 'Visit Japan',
    detail: null,
    note: null,
    advice: null,
    missionKind: null,
    lifeAreaName: null,
    mood: null,
    fromDate: null,
    toDate: null,
    entityType: 'Goal',
    entityId: 9,
    parentTitle: null,
    ...overrides,
  };
}

describe('beatText', () => {
  it('names the mission kind when a goal is set', () => {
    expect(beatText(beat({ missionKind: 'Collectible' })).headline).toBe(
      'Set out on a collectible: Visit Japan',
    );
    expect(beatText(beat({ missionKind: 'Main', title: 'Lead' })).headline).toBe(
      'Set out on a main mission: Lead',
    );
  });

  it('celebrates a passed mission and a great day, and is gentle about the rest', () => {
    expect(beatText(beat({ kind: 'MissionPassed' }))).toEqual({
      icon: 'bi-trophy',
      tone: 'win',
      headline: 'Mission passed: Visit Japan',
    });
    expect(beatText(beat({ kind: 'GoalAbandoned' })).headline).toBe('Let go of Visit Japan');
    expect(beatText(beat({ kind: 'JournalHighlight', mood: 5, title: null })).headline).toBe(
      'A great day',
    );
    expect(beatText(beat({ kind: 'JournalHighlight', mood: 1, title: 'Exam' })).tone).toBe('hard');
  });
});

describe('beatLink', () => {
  it('opens the goal, the habit, or the journal day', () => {
    expect(beatLink(beat({}))).toEqual(['/goals', 9]);
    expect(beatLink(beat({ entityType: 'Habit', entityId: 3 }))).toEqual(['/habits', 3]);
    expect(beatLink(beat({ entityType: 'JournalEntry', entityId: 5, day: '2026-10-13' }))).toEqual([
      '/journal',
      '2026-10-13',
    ]);
    expect(beatLink(beat({ entityId: null }))).toBeNull();
  });
});

describe('chapterLength', () => {
  it('counts whole months and years, end day included', () => {
    expect(chapterLength('2026-01-01', '2026-01-31', '2026-10-15')).toBe('1 month');
    expect(chapterLength('2018-07-01', '2022-06-30', '2026-10-15')).toBe('4 years');
    expect(chapterLength('2022-08-01', '2026-09-30', '2026-10-15')).toBe('4 years, 2 months');
  });

  it('runs an open chapter to today, and counts days under a month', () => {
    expect(chapterLength('2026-10-01', null, '2026-10-15')).toBe('15 days');
    expect(chapterLength('2026-10-15', null, '2026-10-15')).toBe('1 day');
    expect(chapterLength('2025-10-15', null, '2026-10-15')).toBe('1 year');
  });

  it('handles month ends and leap years', () => {
    // Month ends clamp like everywhere else in LifeOS (31 Jan + 1 month = 29 Feb): a calendar month.
    expect(chapterLength('2028-01-31', '2028-02-29', '2030-01-01')).toBe('1 month');
    expect(chapterLength('2028-02-01', '2028-02-28', '2030-01-01')).toBe('28 days');
    expect(chapterLength('2028-02-29', '2029-02-28', '2030-01-01')).toBe('1 year');
  });
});

describe('gapHeading', () => {
  const chapter = {
    chapter: {
      id: 1,
      title: 'X',
      summary: null,
      startDate: '2020-01-01',
      endDate: null,
      isCurrent: true,
    },
    from: null,
    to: null,
    beats: [],
  };
  const gap: StorySection = { chapter: null, from: '2019-01-01', to: '2019-02-01', beats: [] };

  it('says where the stretch sits', () => {
    expect(gapHeading([gap], 0)).toBe('Your story so far');
    expect(gapHeading([gap, chapter], 0)).toBe('Before your first chapter');
    expect(gapHeading([chapter, gap, chapter], 1)).toBe('Between chapters');
    expect(gapHeading([chapter, gap], 1)).toBe('Since your last chapter ended');
  });
});
