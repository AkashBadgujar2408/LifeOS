import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, catchError, defer, from, map, switchMap, tap, throwError } from 'rxjs';
import { ensureVaultUnlocked } from '../../shared/components/vault-unlock/vault-unlock';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { VaultService } from './vault.service';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export const SEXES = ['Female', 'Male', 'Intersex'] as const;
export type Sex = (typeof SEXES)[number];
export const CONDITION_KINDS = ['Condition', 'Allergy', 'Surgery'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];
export const SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type DoseStatus = 'Taken' | 'Skipped';

export interface HealthProfile {
  dateOfBirth: string | null;
  sex: Sex | null;
  bloodGroup: BloodGroup | null;
  heightCm: number | null;
  isOrganDonor: boolean | null;
  notes: string | null;
  age: number | null;
  /** Null until the first save. */
  updatedAt: string | null;
}

export type HealthProfilePayload = Omit<HealthProfile, 'age' | 'updatedAt'> & { today: string };

export interface MedicalCondition {
  id: number;
  kind: ConditionKind;
  name: string;
  severity: Severity | null;
  startedOn: string | null;
  endedOn: string | null;
  notes: string | null;
}

export type MedicalConditionPayload = Omit<MedicalCondition, 'id'> & { today: string };

export interface DoctorVisit {
  id: number;
  reason: string;
  visitOn: string;
  contactId: number | null;
  contactName: string | null;
  specialty: string | null;
  place: string | null;
  conditionId: number | null;
  conditionName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  eventId: number | null;
  followUpOn: string | null;
  notes: string | null;
  prescribed: string[];
}

export interface DoctorVisitPayload {
  reason: string;
  visitOn: string;
  contactId: number | null;
  specialty: string | null;
  place: string | null;
  conditionId: number | null;
  startsAt: string | null;
  endsAt: string | null;
  followUpOn: string | null;
  notes: string | null;
  timeZone: string;
}

export interface MedicationSchedule {
  id: number;
  /** "08:00", local. */
  timeOfDay: string;
  /** ISO weekday bitmask, Mon = 1 … Sun = 64 (as habits). */
  scheduleDays: number;
  dose: string | null;
}

export interface Medication {
  id: number;
  name: string;
  strength: string | null;
  startDate: string;
  endDate: string | null;
  isAsNeeded: boolean;
  conditionId: number | null;
  conditionName: string | null;
  prescribedAtVisitId: number | null;
  notes: string | null;
  schedules: MedicationSchedule[];
  /** % of due doses taken over 30 days; null when none were due. */
  adherence: number | null;
  takenLast30Days: number;
  lastTakenOn: string | null;
}

export interface MedicationPayload {
  name: string;
  strength: string | null;
  startDate: string;
  endDate: string | null;
  isAsNeeded: boolean;
  conditionId: number | null;
  prescribedAtVisitId: number | null;
  notes: string | null;
  schedules: { timeOfDay: string; scheduleDays: number; dose: string | null }[];
}

export interface Dose {
  medicationId: number;
  medicationName: string;
  strength: string | null;
  scheduleId: number;
  timeOfDay: string;
  dose: string | null;
  status: DoseStatus | null;
  takenAt: string | null;
}

export interface DoseSummary {
  due: number;
  done: number;
}

export const WORKOUT_KINDS = [
  'Walk',
  'Run',
  'Cycle',
  'Swim',
  'Strength',
  'Yoga',
  'Sport',
  'Other',
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];
export const INTENSITIES = ['Light', 'Moderate', 'Hard'] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEASUREMENT_KINDS = [
  'Weight',
  'BodyFat',
  'Waist',
  'Chest',
  'Hips',
  'BloodPressure',
  'RestingHeartRate',
  'BloodSugar',
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export interface Workout {
  id: number;
  kind: WorkoutKind;
  occurredOn: string;
  minutes: number;
  steps: number | null;
  distanceKm: number | null;
  calories: number | null;
  intensity: Intensity | null;
  notes: string | null;
}

export type WorkoutPayload = Omit<Workout, 'id'> & { today: string };

export interface WorkoutWeek {
  weekStart: string;
  minutes: number;
  sessions: number;
  steps: number;
}

export interface Fitness {
  workouts: Workout[];
  weeks: WorkoutWeek[];
}

export interface SleepRecord {
  id: number;
  wokeOn: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  quality: number | null;
  isNap: boolean;
  notes: string | null;
}

export type SleepPayload = Omit<SleepRecord, 'id' | 'minutes'> & { today: string };

export interface SleepNight {
  wokeOn: string;
  minutes: number;
  quality: number | null;
}

export interface SleepSummary {
  records: SleepRecord[];
  nights: SleepNight[];
  average7Minutes: number | null;
  average30Minutes: number | null;
  averageQuality30: number | null;
  nightsLogged30: number;
}

export interface Measurement {
  id: number;
  kind: MeasurementKind;
  measuredOn: string;
  value: number;
  value2: number | null;
  notes: string | null;
}

export type MeasurementPayload = Omit<Measurement, 'id'> & { today: string };

export interface MeasurementLatest {
  kind: MeasurementKind;
  unit: string;
  latest: Measurement;
  change: number | null;
  previousOn: string | null;
  count: number;
}

export interface Meal {
  id: number;
  eatenOn: string;
  mealType: MealType;
  description: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
}

export type MealPayload = Omit<Meal, 'id'> & { today: string };

export interface NutritionDay {
  day: string;
  meals: Meal[];
  water: { id: number; millilitres: number; createdAt: string }[];
  waterMl: number;
  calories: number | null;
  proteinG: number | null;
}

export interface NutritionTrendDay {
  day: string;
  calories: number | null;
  waterMl: number;
  meals: number;
}

export type LabFlag = 'Low' | 'Normal' | 'High';

export interface LabResult {
  id: number;
  testName: string;
  takenOn: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  laboratory: string | null;
  visitId: number | null;
  notes: string | null;
  flag: LabFlag | null;
}

export type LabResultPayload = Omit<LabResult, 'id' | 'flag'> & { today: string };

export interface LabTest {
  testName: string;
  unit: string | null;
  /** Newest first. */
  results: LabResult[];
  latestOutOfRange: boolean;
}

export interface WellnessCheckIn {
  day: string;
  stressLevel: number | null;
  energyLevel: number | null;
  notes: string | null;
}

export interface WellnessDay {
  day: string;
  mood: number | null;
  stressLevel: number | null;
  energyLevel: number | null;
}

export interface Wellness {
  days: WellnessDay[];
  today: WellnessCheckIn | null;
  averageMood: number | null;
  averageStress: number | null;
  averageEnergy: number | null;
}

export const GOAL_TARGET_KINDS = [
  'Weight',
  'BodyFat',
  'Waist',
  'Chest',
  'Hips',
  'RestingHeartRate',
  'BloodSugar',
] as const;
export type GoalTargetKind = (typeof GOAL_TARGET_KINDS)[number];

export interface GoalTarget {
  goalId: number;
  goalTitle: string;
  kind: GoalTargetKind;
  unit: string;
  startValue: number;
  targetValue: number;
  latestValue: number | null;
  latestOn: string | null;
  percent: number;
}

/** Thrown when Health is locked and the user dismissed the password prompt. */
export class HealthLockedError extends Error {
  constructor() {
    super('Health records stay locked until you enter your password.');
  }
}

/**
 * Health records. Every call needs the vault unlock: it asks for the password first when locked, sends the unlock
 * header, and on a 423 (the unlock ran out on the server) locks, asks again and retries once. Dismissing the prompt
 * fails the call with a HealthLockedError, which pages show as their load error.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly vault = inject(VaultService);
  private readonly modal = inject(NgbModal);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Health';
  private pendingUnlock: Promise<boolean> | null = null;

  /** Counts only, no unlock needed (My Day). */
  doseSummary(today: string): Observable<DoseSummary> {
    return this.http
      .get<ApiResponse<DoseSummary>>(`${this.base}/DoseSummary`, { params: { today } })
      .pipe(map((response) => response.data!));
  }

  isUnlocked(): boolean {
    return this.vault.isUnlocked();
  }

  /**
   * Asks for the password if needed; resolves true once Health can be read. Calls made together (a page loading
   * several lists) share the one prompt.
   */
  unlock(): Promise<boolean> {
    if (this.vault.isUnlocked()) {
      return Promise.resolve(true);
    }
    this.pendingUnlock ??= ensureVaultUnlocked(
      this.modal,
      this.vault,
      'Your health records are private.',
    ).finally(() => (this.pendingUnlock = null));
    return this.pendingUnlock;
  }

  // ---- Profile ----

  profile(today: string): Observable<HealthProfile> {
    return this.guarded(() =>
      this.http.get<ApiResponse<HealthProfile>>(`${this.base}/HealthProfile`, {
        params: { today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveProfile(payload: HealthProfilePayload): Observable<HealthProfile> {
    return this.guarded(() =>
      this.http.put<ApiResponse<HealthProfile>>(`${this.base}/HealthProfile`, payload, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  // ---- Medical history ----

  conditions(): Observable<MedicalCondition[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<MedicalCondition[]>>(`${this.base}/MedicalConditions`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  condition(id: number): Observable<MedicalCondition> {
    return this.guarded(() =>
      this.http.get<ApiResponse<MedicalCondition>>(`${this.base}/MedicalConditions/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveCondition(id: number | null, payload: MedicalConditionPayload): Observable<MedicalCondition> {
    return this.guarded(() =>
      id
        ? this.http.put<ApiResponse<MedicalCondition>>(
            `${this.base}/MedicalConditions/${id}`,
            payload,
            { headers: this.vault.headers() },
          )
        : this.http.post<ApiResponse<MedicalCondition>>(`${this.base}/MedicalConditions`, payload, {
            headers: this.vault.headers(),
          }),
    ).pipe(map((response) => response.data!));
  }

  removeCondition(id: number): Observable<void> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<boolean>>(`${this.base}/MedicalConditions/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Visits ----

  visits(): Observable<DoctorVisit[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<DoctorVisit[]>>(`${this.base}/DoctorVisits`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  visit(id: number): Observable<DoctorVisit> {
    return this.guarded(() =>
      this.http.get<ApiResponse<DoctorVisit>>(`${this.base}/DoctorVisits/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveVisit(id: number | null, payload: DoctorVisitPayload): Observable<DoctorVisit> {
    return this.guarded(() =>
      id
        ? this.http.put<ApiResponse<DoctorVisit>>(`${this.base}/DoctorVisits/${id}`, payload, {
            headers: this.vault.headers(),
          })
        : this.http.post<ApiResponse<DoctorVisit>>(`${this.base}/DoctorVisits`, payload, {
            headers: this.vault.headers(),
          }),
    ).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  removeVisit(id: number): Observable<void> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<boolean>>(`${this.base}/DoctorVisits/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Medicines ----

  medications(today: string): Observable<Medication[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Medication[]>>(`${this.base}/Medications`, {
        params: { today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  medication(id: number, today: string): Observable<Medication> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Medication>>(`${this.base}/Medications/${id}`, {
        params: { today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveMedication(
    id: number | null,
    payload: MedicationPayload,
    today: string,
  ): Observable<Medication> {
    return this.guarded(() =>
      id
        ? this.http.put<ApiResponse<Medication>>(`${this.base}/Medications/${id}`, payload, {
            params: { today },
            headers: this.vault.headers(),
          })
        : this.http.post<ApiResponse<Medication>>(`${this.base}/Medications`, payload, {
            params: { today },
            headers: this.vault.headers(),
          }),
    ).pipe(map((response) => response.data!));
  }

  removeMedication(id: number): Observable<void> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<boolean>>(`${this.base}/Medications/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  doses(day: string): Observable<Dose[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Dose[]>>(`${this.base}/Medications/doses/${day}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  /** Marks or clears one dose; returns the day's doses. */
  setDose(
    day: string,
    scheduleId: number,
    status: DoseStatus | null,
    today: string,
  ): Observable<Dose[]> {
    return this.guarded(() =>
      this.http.put<ApiResponse<Dose[]>>(
        `${this.base}/Medications/doses/${day}/${scheduleId}`,
        { status, today },
        { headers: this.vault.headers() },
      ),
    ).pipe(map((response) => response.data ?? []));
  }

  logAsNeeded(id: number, doseDate: string, today: string): Observable<Medication> {
    return this.guarded(() =>
      this.http.post<ApiResponse<Medication>>(
        `${this.base}/Medications/${id}/as-needed`,
        { doseDate, today },
        { headers: this.vault.headers() },
      ),
    ).pipe(map((response) => response.data!));
  }

  removeAsNeeded(id: number, day: string, today: string): Observable<Medication> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<Medication>>(`${this.base}/Medications/${id}/as-needed/${day}`, {
        params: { today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  // ---- Fitness, sleep, body, nutrition ----

  fitness(from: string, to: string, today: string, weeks = 12): Observable<Fitness> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Fitness>>(`${this.base}/Workouts`, {
        params: { from, to, today, weeks },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveWorkout(id: number | null, payload: WorkoutPayload): Observable<Workout> {
    return this.save<Workout>('Workouts', id, payload);
  }

  removeWorkout(id: number): Observable<void> {
    return this.remove(`Workouts/${id}`);
  }

  sleep(from: string, to: string, today: string): Observable<SleepSummary> {
    return this.guarded(() =>
      this.http.get<ApiResponse<SleepSummary>>(`${this.base}/Sleep`, {
        params: { from, to, today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveSleep(id: number | null, payload: SleepPayload): Observable<SleepRecord> {
    return this.save<SleepRecord>('Sleep', id, payload);
  }

  removeSleep(id: number): Observable<void> {
    return this.remove(`Sleep/${id}`);
  }

  latestMeasurements(): Observable<MeasurementLatest[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<MeasurementLatest[]>>(`${this.base}/Measurements/latest`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  measurements(kind: MeasurementKind): Observable<Measurement[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Measurement[]>>(`${this.base}/Measurements`, {
        params: { kind },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  saveMeasurement(id: number | null, payload: MeasurementPayload): Observable<Measurement> {
    return this.save<Measurement>('Measurements', id, payload);
  }

  removeMeasurement(id: number): Observable<void> {
    return this.remove(`Measurements/${id}`);
  }

  nutritionDay(day: string): Observable<NutritionDay> {
    return this.guarded(() =>
      this.http.get<ApiResponse<NutritionDay>>(`${this.base}/Nutrition/day/${day}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  nutritionTrend(from: string, to: string): Observable<NutritionTrendDay[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<NutritionTrendDay[]>>(`${this.base}/Nutrition`, {
        params: { from, to },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  saveMeal(id: number | null, payload: MealPayload): Observable<Meal> {
    return this.save<Meal>('Nutrition/meals', id, payload);
  }

  removeMeal(id: number): Observable<void> {
    return this.remove(`Nutrition/meals/${id}`);
  }

  addWater(drunkOn: string, millilitres: number, today: string): Observable<NutritionDay> {
    return this.guarded(() =>
      this.http.post<ApiResponse<NutritionDay>>(
        `${this.base}/Nutrition/water`,
        { drunkOn, millilitres, today },
        { headers: this.vault.headers() },
      ),
    ).pipe(map((response) => response.data!));
  }

  removeWater(id: number): Observable<NutritionDay> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<NutritionDay>>(`${this.base}/Nutrition/water/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  // ---- Labs, wellness, goal targets ----

  labTests(): Observable<LabTest[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<LabTest[]>>(`${this.base}/LabResults`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  labResult(id: number): Observable<LabResult> {
    return this.guarded(() =>
      this.http.get<ApiResponse<LabResult>>(`${this.base}/LabResults/${id}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  saveLabResult(id: number | null, payload: LabResultPayload): Observable<LabResult> {
    return this.save<LabResult>('LabResults', id, payload);
  }

  removeLabResult(id: number): Observable<void> {
    return this.remove(`LabResults/${id}`).pipe(tap(() => this.remindersService.notifyChanged()));
  }

  wellness(from: string, to: string, today: string): Observable<Wellness> {
    return this.guarded(() =>
      this.http.get<ApiResponse<Wellness>>(`${this.base}/Wellness`, {
        params: { from, to, today },
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data!));
  }

  /** Saves the day's check-in; null back when it was all blank (removed). */
  saveCheckIn(
    day: string,
    payload: {
      stressLevel: number | null;
      energyLevel: number | null;
      notes: string | null;
      today: string;
    },
  ): Observable<WellnessCheckIn | null> {
    return this.guarded(() =>
      this.http.put<ApiResponse<WellnessCheckIn | null>>(`${this.base}/Wellness/${day}`, payload, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? null));
  }

  goalTargets(): Observable<GoalTarget[]> {
    return this.guarded(() =>
      this.http.get<ApiResponse<GoalTarget[]>>(`${this.base}/GoalTargets`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? []));
  }

  goalTarget(goalId: number): Observable<GoalTarget | null> {
    return this.guarded(() =>
      this.http.get<ApiResponse<GoalTarget | null>>(`${this.base}/GoalTargets/${goalId}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? null));
  }

  saveGoalTarget(
    goalId: number,
    payload: { kind: GoalTargetKind; startValue: number | null; targetValue: number },
  ): Observable<GoalTarget | null> {
    return this.guarded(() =>
      this.http.put<ApiResponse<GoalTarget | null>>(`${this.base}/GoalTargets/${goalId}`, payload, {
        headers: this.vault.headers(),
      }),
    ).pipe(map((response) => response.data ?? null));
  }

  removeGoalTarget(goalId: number): Observable<void> {
    return this.remove(`GoalTargets/${goalId}`);
  }

  /** POST for a new one, PUT to `{path}/{id}` for an existing one. */
  private save<T>(path: string, id: number | null, payload: object): Observable<T> {
    return this.guarded(() =>
      id
        ? this.http.put<ApiResponse<T>>(`${this.base}/${path}/${id}`, payload, {
            headers: this.vault.headers(),
          })
        : this.http.post<ApiResponse<T>>(`${this.base}/${path}`, payload, {
            headers: this.vault.headers(),
          }),
    ).pipe(map((response) => response.data!));
  }

  private remove(path: string): Observable<void> {
    return this.guarded(() =>
      this.http.delete<ApiResponse<boolean>>(`${this.base}/${path}`, {
        headers: this.vault.headers(),
      }),
    ).pipe(map(() => undefined));
  }

  /** Unlocks first if needed, then makes the call; a 423 locks, asks again and retries once. */
  private guarded<T>(call: () => Observable<T>): Observable<T> {
    const unlockThen = () =>
      from(this.unlock()).pipe(
        switchMap((unlocked) => (unlocked ? call() : throwError(() => new HealthLockedError()))),
      );
    return defer(unlockThen).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 423) {
          this.vault.lock();
          return unlockThen();
        }
        return throwError(() => err);
      }),
    );
  }
}
