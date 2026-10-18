import type { StudySubjectSeries } from '../../core/services/learning.service';

/** How many categorical colours the study chart has (`--lifeos-series-1` … `-5`); "Everything else" is grey. */
export const SERIES_SLOTS = 5;

/** A subject's identity across requests: "Skill:3", "Topic:subjunctive", "Other". */
export function subjectKey(subject: Pick<StudySubjectSeries, 'kind' | 'id' | 'name'>): string {
  if (subject.kind === 'Other') {
    return 'Other';
  }
  return subject.kind === 'Topic'
    ? `Topic:${subject.name.toLocaleLowerCase()}`
    : `${subject.kind}:${subject.id}`;
}

/**
 * Colour slots (0-based) for the subjects shown, so a colour follows its subject rather than its rank: a subject
 * that already had a slot keeps it, a new one takes the lowest slot nobody shown is using. "Other" gets none (grey).
 * Returns the new assignment — pass it back in next time (e.g. when the range changes).
 */
export function assignSlots(
  previous: ReadonlyMap<string, number>,
  keys: readonly string[],
  slots = SERIES_SLOTS,
): Map<string, number> {
  const next = new Map<string, number>();
  const shown = keys.filter((k) => k !== 'Other');
  for (const key of shown) {
    const slot = previous.get(key);
    if (slot !== undefined && slot < slots) {
      next.set(key, slot);
    }
  }
  for (const key of shown) {
    if (!next.has(key)) {
      const used = new Set(next.values());
      const free = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
      if (free !== undefined) {
        next.set(key, free);
      }
    }
  }
  return next;
}

/** Minutes as hours for the axis and tooltips: 90 → 1.5, 20 → 0.3 (one decimal). */
export function toHours(minutes: number): number {
  return Math.round(minutes / 6) / 10;
}
