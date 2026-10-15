import { toLocalIsoDate } from '../../core/dates/today';
import { Mission, MissionKind } from '../../core/services/story.service';
import { daysBetween } from '../dashboard/my-day-view';

export const MISSION_KINDS: readonly MissionKind[] = ['Main', 'Side', 'Collectible'];

export const MISSION_KIND_META: Record<
  MissionKind,
  { label: string; plural: string; icon: string; hint: string }
> = {
  Main: {
    label: 'Main mission',
    plural: 'Main missions',
    icon: 'bi-star-fill',
    hint: 'Long-term goals: the storyline.',
  },
  Side: {
    label: 'Side mission',
    plural: 'Side missions',
    icon: 'bi-signpost-split',
    hint: 'Short-term goals, done along the way.',
  },
  Collectible: {
    label: 'Collectible',
    plural: 'Collectibles',
    icon: 'bi-gem',
    hint: 'Bucket-list experiences, picked up whenever.',
  },
};

export type MissionFilter = 'inPlay' | 'passed' | 'letGo';

/** In play = Active or Postponed (on hold); passed = Completed; let go = Abandoned. */
export function missionFilterOf(mission: Mission): MissionFilter {
  switch (mission.status) {
    case 'Completed':
      return 'passed';
    case 'Abandoned':
      return 'letGo';
    default:
      return 'inPlay';
  }
}

/**
 * In-play missions per kind, in the order you'd pick one up: unlocked before locked, on-hold last, then the nearest
 * target date (undated after dated), then oldest first.
 */
export function inPlayByKind(missions: readonly Mission[]): Record<MissionKind, Mission[]> {
  const rank = (m: Mission) => (m.status === 'Postponed' ? 2 : m.isLocked ? 1 : 0);
  const sorted = missions
    .filter((m) => missionFilterOf(m) === 'inPlay')
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') ||
        a.createdAt.localeCompare(b.createdAt),
    );
  return {
    Main: sorted.filter((m) => m.kind === 'Main'),
    Side: sorted.filter((m) => m.kind === 'Side'),
    Collectible: sorted.filter((m) => m.kind === 'Collectible'),
  };
}

/** Passed missions, most recent first. */
export function passedMissions(missions: readonly Mission[]): Mission[] {
  return missions
    .filter((m) => m.status === 'Completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/**
 * How long a mission took, in the user's local days, from setting the goal to passing it ("same day" = 0). The API
 * sends both moments as UTC; converting each to a local date first means late-evening completions count right.
 */
export function daysTaken(createdAtUtc: string, completedAtUtc: string): number {
  return Math.max(
    0,
    daysBetween(toLocalIsoDate(new Date(createdAtUtc)), toLocalIsoDate(new Date(completedAtUtc))),
  );
}

export function daysTakenLabel(days: number): string {
  return days === 0 ? 'the same day' : days === 1 ? '1 day' : `${days} days`;
}

/** The first open objective, the mission's "next step". */
export function nextObjective(mission: Mission): string | null {
  return mission.objectives.find((o) => !o.done)?.title ?? null;
}
