import type {
  CourseStatus,
  Proficiency,
  Skill,
  SkillLevelChange,
} from '../../core/services/learning.service';

export const PROFICIENCY_LEVELS: readonly Proficiency[] = [1, 2, 3, 4, 5];

/** What each level means, so a "3" reads the same to everyone. */
export const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  1: 'Just starting',
  2: 'Getting the basics',
  3: 'Comfortable',
  4: 'Strong',
  5: 'Could teach it',
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  InProgress: 'In progress',
  Planned: 'Planned',
  Completed: 'Completed',
  Dropped: 'Dropped',
};

/** Items grouped under their status, in the given order; empty groups are left out. */
export function groupByStatus<S extends string, T extends { status: S }>(
  items: readonly T[],
  order: readonly S[],
): { status: S; items: T[] }[] {
  return order
    .map((status) => ({ status, items: items.filter((item) => item.status === status) }))
    .filter((group) => group.items.length > 0);
}

/** "1 level to go", "At your target", or null without a target. */
export function targetText(skill: Pick<Skill, 'proficiency' | 'targetProficiency'>): string | null {
  if (skill.targetProficiency === null) {
    return null;
  }
  const gap = skill.targetProficiency - skill.proficiency;
  if (gap <= 0) {
    return 'At your target';
  }
  return `${gap} ${gap === 1 ? 'level' : 'levels'} to go`;
}

/** A level change in words: "Started at Getting the basics", "Up to Comfortable", "Down to Just starting". */
export function levelChangeText(change: SkillLevelChange): string {
  const to = PROFICIENCY_LABELS[change.toProficiency];
  if (change.fromProficiency === null) {
    return `Started at ${to}`;
  }
  return change.toProficiency > change.fromProficiency ? `Up to ${to}` : `Down to ${to}`;
}
