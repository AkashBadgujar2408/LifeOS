import { Mission } from '../../core/services/story.service';
import {
  daysTaken,
  daysTakenLabel,
  inPlayByKind,
  missionFilterOf,
  nextObjective,
  passedMissions,
} from './missions-view';

function mission(id: number, overrides: Partial<Mission> = {}): Mission {
  return {
    id,
    title: `M${id}`,
    kind: 'Side',
    status: 'Active',
    lifeAreaName: 'Health',
    targetDate: null,
    createdAt: `2026-10-0${id}T10:00:00Z`,
    completedAt: null,
    progressPercent: 0,
    objectives: [],
    prerequisites: [],
    blockedBy: [],
    unlocks: [],
    isLocked: false,
    hasDebrief: false,
    ...overrides,
  };
}

describe('missionFilterOf', () => {
  it('sorts statuses into in play, passed and let go', () => {
    expect(missionFilterOf(mission(1))).toBe('inPlay');
    expect(missionFilterOf(mission(1, { status: 'Postponed' }))).toBe('inPlay');
    expect(missionFilterOf(mission(1, { status: 'Completed' }))).toBe('passed');
    expect(missionFilterOf(mission(1, { status: 'Abandoned' }))).toBe('letGo');
  });
});

describe('inPlayByKind', () => {
  it('groups by kind and puts unlocked first, then locked, then on hold', () => {
    const groups = inPlayByKind([
      mission(1, { status: 'Postponed' }),
      mission(2, { isLocked: true }),
      mission(3),
      mission(4, { kind: 'Main' }),
      mission(5, { status: 'Completed' }),
      mission(6, { kind: 'Collectible', status: 'Abandoned' }),
    ]);
    expect(groups.Side.map((m) => m.id)).toEqual([3, 2, 1]);
    expect(groups.Main.map((m) => m.id)).toEqual([4]);
    expect(groups.Collectible).toEqual([]);
  });

  it('orders by nearest target date, undated last, then oldest', () => {
    const groups = inPlayByKind([
      mission(1),
      mission(2, { targetDate: '2027-01-01' }),
      mission(3, { targetDate: '2026-11-01' }),
    ]);
    expect(groups.Side.map((m) => m.id)).toEqual([3, 2, 1]);
  });
});

describe('passedMissions', () => {
  it('lists completed ones, most recent first', () => {
    const passed = passedMissions([
      mission(1, { status: 'Completed', completedAt: '2026-10-10T10:00:00Z' }),
      mission(2),
      mission(3, { status: 'Completed', completedAt: '2026-10-12T10:00:00Z' }),
    ]);
    expect(passed.map((m) => m.id)).toEqual([3, 1]);
  });
});

describe('daysTaken', () => {
  it('counts local calendar days between setting and passing', () => {
    // Local noon to local noon three days later, whatever the timezone.
    const start = new Date(2026, 9, 12, 12, 0).toISOString();
    const end = new Date(2026, 9, 15, 12, 0).toISOString();
    expect(daysTaken(start, end)).toBe(3);
    expect(daysTaken(start, start)).toBe(0);
  });

  it('counts a late-evening set and early-morning pass as one day', () => {
    const start = new Date(2026, 9, 14, 23, 30).toISOString();
    const end = new Date(2026, 9, 15, 0, 30).toISOString();
    expect(daysTaken(start, end)).toBe(1);
  });

  it('labels in words', () => {
    expect(daysTakenLabel(0)).toBe('the same day');
    expect(daysTakenLabel(1)).toBe('1 day');
    expect(daysTakenLabel(12)).toBe('12 days');
  });
});

describe('nextObjective', () => {
  it('is the first open objective', () => {
    const m = mission(1, {
      objectives: [
        { id: 1, title: 'Run 5k', done: true, targetDate: null },
        { id: 2, title: 'Run 10k', done: false, targetDate: null },
      ],
    });
    expect(nextObjective(m)).toBe('Run 10k');
    expect(nextObjective(mission(2))).toBeNull();
  });
});
