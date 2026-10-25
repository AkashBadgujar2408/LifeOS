import { Achievement } from '../../core/services/story.service';
import { progressPercent, progressText, splitAchievements } from './achievements-view';

function achievement(key: string, overrides: Partial<Achievement> = {}): Achievement {
  return {
    key,
    title: key,
    description: '',
    icon: 'bi-award',
    progress: 0,
    target: 10,
    unlockedOn: null,
    unlocked: false,
    module: null,
    currency: null,
    needsRate: false,
    ...overrides,
  };
}

describe('achievements-view', () => {
  it('lists unlocked newest first and locked closest to done first', () => {
    const { unlocked, locked } = splitAchievements([
      achievement('a', { progress: 1 }),
      achievement('b', { unlockedOn: '2026-09-01', unlocked: true, progress: 10 }),
      achievement('c', { progress: 6 }),
      achievement('d', { unlockedOn: '2026-10-14', unlocked: true, progress: 10 }),
      achievement('e', { progress: 1 }),
      achievement('f', { progress: 3, target: 5 }),
    ]);

    expect(unlocked.map((a) => a.key)).toEqual(['d', 'b']);
    expect(locked.map((a) => a.key)).toEqual(['c', 'f', 'a', 'e']);
  });

  it('turns progress into a bar width', () => {
    expect(progressPercent(achievement('a', { progress: 3, target: 7 }))).toBe(42);
    expect(progressPercent(achievement('a', { progress: 9, target: 7 }))).toBe(100);
    expect(progressPercent(achievement('a', { progress: 1, target: 0 }))).toBe(0);
  });

  it('writes progress as counts or as money in whole units', () => {
    expect(progressText(achievement('a', { progress: 3, target: 5 }))).toBe('3 of 5');
    expect(
      progressText(achievement('a', { progress: 640000, target: 1000000, currency: 'INR' })),
    ).toBe('₹6,40,000 of ₹10,00,000');
  });
});
