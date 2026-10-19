import type {
  ConditionKind,
  DoctorVisit,
  Dose,
  Intensity,
  LabResult,
  MealType,
  Measurement,
  MeasurementKind,
  Medication,
  Severity,
  SleepNight,
  WorkoutKind,
} from '../../core/services/health.service';
import { addDaysIso } from '../../core/dates/today';
import { localDateTimeToUtc } from '../calendar/calendar-feed';

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

// ---- Fitness, sleep, body, nutrition ----

export const WORKOUT_KIND_LABELS: Record<WorkoutKind, string> = {
  Walk: 'Walk',
  Run: 'Run',
  Cycle: 'Cycle',
  Swim: 'Swim',
  Strength: 'Strength',
  Yoga: 'Yoga',
  Sport: 'Sport',
  Other: 'Other',
};

export const WORKOUT_KIND_ICONS: Record<WorkoutKind, string> = {
  Walk: 'bi-person-walking',
  Run: 'bi-lightning',
  Cycle: 'bi-bicycle',
  Swim: 'bi-water',
  Strength: 'bi-trophy',
  Yoga: 'bi-flower1',
  Sport: 'bi-dribbble',
  Other: 'bi-activity',
};

export const INTENSITY_LABELS: Record<Intensity, string> = {
  Light: 'Light',
  Moderate: 'Moderate',
  Hard: 'Hard',
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  Breakfast: 'Breakfast',
  Lunch: 'Lunch',
  Dinner: 'Dinner',
  Snack: 'Snack',
};

/** Each kind's name and the one unit it's stored in (HealthKinds.MeasurementUnits). */
export const MEASUREMENTS: Record<
  MeasurementKind,
  { label: string; unit: string; placeholder: string }
> = {
  Weight: { label: 'Weight', unit: 'kg', placeholder: 'e.g. 72.5' },
  BodyFat: { label: 'Body fat', unit: '%', placeholder: 'e.g. 21' },
  Waist: { label: 'Waist', unit: 'cm', placeholder: 'e.g. 84' },
  Chest: { label: 'Chest', unit: 'cm', placeholder: 'e.g. 98' },
  Hips: { label: 'Hips', unit: 'cm', placeholder: 'e.g. 96' },
  BloodPressure: { label: 'Blood pressure', unit: 'mmHg', placeholder: 'e.g. 120' },
  RestingHeartRate: { label: 'Resting heart rate', unit: 'bpm', placeholder: 'e.g. 64' },
  BloodSugar: { label: 'Blood sugar', unit: 'mg/dL', placeholder: 'e.g. 98' },
};

const number = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

/** "120/80 mmHg", "80.9 kg". */
export function measurementText(m: Pick<Measurement, 'kind' | 'value' | 'value2'>): string {
  const unit = MEASUREMENTS[m.kind].unit;
  const value = m.value2 !== null ? `${number(m.value)}/${number(m.value2)}` : number(m.value);
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/** "−0.6 kg", "+2 cm", "no change". */
export function changeText(change: number, kind: MeasurementKind): string {
  if (change === 0) {
    return 'no change';
  }
  const unit = MEASUREMENTS[kind].unit;
  const sign = change > 0 ? '+' : '−';
  const value = number(Math.abs(change));
  return unit === '%' ? `${sign}${value} points` : `${sign}${value} ${unit}`;
}

/** 455 → "7 h 35 min", 60 → "1 h", 45 → "45 min". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * A sleep's span from the morning it ended and two clock times: a bedtime later on the clock than waking up (23:00
 * → 07:00) was the evening before; one earlier (01:30 → 07:00, or a nap 14:00 → 14:30) was that same day. UTC
 * instants, computed in the browser's zone like every timed entry.
 */
export function sleepSpan(
  wokeOn: string,
  bed: { hour: number; minute: number },
  wake: { hour: number; minute: number },
): { startedAt: string; endedAt: string } {
  const bedMinutes = bed.hour * 60 + bed.minute;
  const wakeMinutes = wake.hour * 60 + wake.minute;
  const bedDay = bedMinutes >= wakeMinutes ? addDaysIso(wokeOn, -1) : wokeOn;
  return {
    startedAt: localDateTimeToUtc(bedDay, bed.hour, bed.minute),
    endedAt: localDateTimeToUtc(wokeOn, wake.hour, wake.minute),
  };
}

/** Every day from..to with its night's minutes (null when nothing was logged), oldest first. */
export function nightSeries(
  nights: SleepNight[],
  from: string,
  to: string,
): { day: string; minutes: number | null }[] {
  const byDay = new Map(nights.map((n) => [n.wokeOn, n.minutes]));
  const days: { day: string; minutes: number | null }[] = [];
  for (let day = from; day <= to; day = addDaysIso(day, 1)) {
    days.push({ day, minutes: byDay.get(day) ?? null });
  }
  return days;
}

// ---- Labs ----

/** "5.9 %", "92 mg/dL", "Negative". */
export function labValueText(r: Pick<LabResult, 'value' | 'valueText' | 'unit'>): string {
  if (r.value === null) {
    return r.valueText ?? '';
  }
  return r.unit ? `${number(r.value)} ${r.unit}` : number(r.value);
}

/** The lab's reference range as printed: "4–5.6", "below 100", "above 40", or null without one. */
export function labRangeText(r: Pick<LabResult, 'rangeLow' | 'rangeHigh'>): string | null {
  if (r.rangeLow !== null && r.rangeHigh !== null) {
    return `${number(r.rangeLow)}–${number(r.rangeHigh)}`;
  }
  if (r.rangeHigh !== null) {
    return `below ${number(r.rangeHigh)}`;
  }
  return r.rangeLow !== null ? `above ${number(r.rangeLow)}` : null;
}
