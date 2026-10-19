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
