import type {
  ConditionKind,
  DoctorVisit,
  Dose,
  Medication,
  Severity,
} from '../../core/services/health.service';

export const CONDITION_KIND_LABELS: Record<ConditionKind, string> = {
  Condition: 'Condition',
  Allergy: 'Allergy',
  Surgery: 'Surgery',
};

export const CONDITION_KIND_PLURALS: Record<ConditionKind, string> = {
  Condition: 'Conditions',
  Allergy: 'Allergies',
  Surgery: 'Surgeries',
};

export const CONDITION_KIND_ICONS: Record<ConditionKind, string> = {
  Condition: 'bi-heart-pulse',
  Allergy: 'bi-exclamation-octagon',
  Surgery: 'bi-bandaid',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  Mild: 'Mild',
  Moderate: 'Moderate',
  Severe: 'Severe',
};

/** "08:00" → "8:00 AM", "20:30" → "8:30 PM" (the app's h:mm a). */
export function timeLabel(timeOfDay: string): string {
  const [h, m] = timeOfDay.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Upcoming visits soonest first (today included), then past ones newest first. */
export function visitBuckets(
  visits: DoctorVisit[],
  today: string,
): { upcoming: DoctorVisit[]; past: DoctorVisit[] } {
  const byDay = (a: DoctorVisit, b: DoctorVisit) =>
    a.visitOn.localeCompare(b.visitOn) || (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
  return {
    upcoming: visits.filter((v) => v.visitOn >= today).sort(byDay),
    past: visits.filter((v) => v.visitOn < today).sort((a, b) => byDay(b, a)),
  };
}

/** Follow-ups still ahead (or due), soonest first. */
export function followUpsDue(visits: DoctorVisit[], today: string): DoctorVisit[] {
  return visits
    .filter((v) => v.followUpOn !== null && v.followUpOn >= today)
    .sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!));
}

export type MedicationState = 'current' | 'upcoming' | 'stopped';

export function medicationState(medication: Medication, today: string): MedicationState {
  if (medication.startDate > today) {
    return 'upcoming';
  }
  return medication.endDate !== null && medication.endDate < today ? 'stopped' : 'current';
}

/** Current medicines (scheduled first, then as needed), ones starting later, and stopped ones. */
export function medicationGroups(
  medications: Medication[],
  today: string,
): Record<MedicationState, Medication[]> {
  const groups: Record<MedicationState, Medication[]> = { current: [], upcoming: [], stopped: [] };
  for (const m of medications) {
    groups[medicationState(m, today)].push(m);
  }
  groups.current.sort(
    (a, b) => Number(a.isAsNeeded) - Number(b.isAsNeeded) || a.name.localeCompare(b.name),
  );
  groups.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  groups.stopped.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
  return groups;
}

/** "2 of 3 taken" style counts: done = taken or knowingly skipped. */
export function doseCounts(doses: Dose[]): { due: number; done: number; taken: number } {
  return {
    due: doses.length,
    done: doses.filter((d) => d.status !== null).length,
    taken: doses.filter((d) => d.status === 'Taken').length,
  };
}

/** "8:00 AM, 8:00 PM" — a medicine's times in one line. */
export function scheduleSummary(medication: Medication): string {
  if (medication.isAsNeeded) {
    return 'When needed';
  }
  return medication.schedules.map((s) => timeLabel(s.timeOfDay)).join(', ');
}
