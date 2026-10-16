import { LifeAreaStats } from '../../core/services/story.service';
import {
  activityWindow,
  addMonths,
  levelPercent,
  monthEnd,
  monthOf,
  ratingChange,
  statsLine,
} from './life-areas-view';

function stats(overrides: Partial<LifeAreaStats> = {}): LifeAreaStats {
  return {
    lifeAreaId: 1,
    lifeAreaName: 'Health',
    goalsCompleted: 0,
    milestonesCompleted: 0,
    habitDays: 0,
    journalEntries: 0,
    lastActivityOn: null,
    xp: 0,
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
    ...overrides,
  };
}

describe('life-areas-view', () => {
  it('keys a day by its month', () => {
    expect(monthOf('2026-10-16')).toBe('2026-10-01');
    expect(monthOf('2026-01-31')).toBe('2026-01-01');
  });

  it('moves between months across year ends', () => {
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-01', -15)).toBe('2024-12-01');
  });

  it('finds the last day of a month, leap years included', () => {
    expect(monthEnd('2026-10-01')).toBe('2026-10-31');
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    expect(monthEnd('2028-02-01')).toBe('2028-02-29');
    expect(monthEnd('2026-04-01')).toBe('2026-04-30');
  });

  it('covers a past month whole and the current one up to today', () => {
    expect(activityWindow('2026-09-01', '2026-10-16')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(activityWindow('2026-10-01', '2026-10-16')).toEqual({
      from: '2026-10-01',
      to: '2026-10-16',
    });
  });

  it('describes how a rating moved', () => {
    expect(ratingChange(7, 5)).toBe('up 2 from last month');
    expect(ratingChange(4, 6)).toBe('down 2 from last month');
    expect(ratingChange(6, 6)).toBe('same as last month');
    expect(ratingChange(6, null)).toBeNull();
    expect(ratingChange(null, 6)).toBeNull();
  });

  it('floors the level bar so it is never full before the level-up', () => {
    expect(levelPercent({ xpIntoLevel: 0, xpForNextLevel: 100 })).toBe(0);
    expect(levelPercent({ xpIntoLevel: 199, xpForNextLevel: 200 })).toBe(99);
    expect(levelPercent({ xpIntoLevel: 10, xpForNextLevel: 0 })).toBe(0);
  });

  it('says what earned the XP', () => {
    expect(statsLine(stats())).toBe('Nothing finished here yet');
    expect(statsLine(stats({ goalsCompleted: 1, habitDays: 7 }))).toBe(
      '1 mission passed · 7 habit days',
    );
    expect(statsLine(stats({ milestonesCompleted: 1, journalEntries: 2 }))).toBe(
      '1 objective · 2 journal entries',
    );
  });
});
