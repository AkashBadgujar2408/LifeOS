import { Achievement } from '../../core/services/story.service';
import { formatMoney } from '../finance/finance-view';

/**
 * Unlocked achievements newest first; locked ones closest to done first (by share of the target), keeping the API's
 * order among equals so related ones stay together.
 */
export function splitAchievements(achievements: readonly Achievement[]): {
  unlocked: Achievement[];
  locked: Achievement[];
} {
  const share = (a: Achievement) => (a.target > 0 ? a.progress / a.target : 0);
  return {
    unlocked: achievements
      .filter((a) => a.unlockedOn !== null)
      .sort((a, b) => b.unlockedOn!.localeCompare(a.unlockedOn!)),
    locked: achievements
      .map((a, index) => ({ a, index }))
      .filter(({ a }) => a.unlockedOn === null)
      .sort((x, y) => share(y.a) - share(x.a) || x.index - y.index)
      .map(({ a }) => a),
  };
}

/** "3 of 5", or money in whole units ("₹6,40,000 of ₹10,00,000"). */
export function progressText(achievement: Achievement): string {
  const { progress, target, currency } = achievement;
  if (currency === null) {
    return `${progress} of ${target}`;
  }
  const money = (amount: number) => formatMoney(amount, currency).replace(/\.00$/, '');
  return `${money(progress)} of ${money(target)}`;
}

/** A 0–100 width for the progress bar. */
export function progressPercent(achievement: Achievement): number {
  return achievement.target <= 0
    ? 0
    : Math.min(100, Math.floor((achievement.progress * 100) / achievement.target));
}
