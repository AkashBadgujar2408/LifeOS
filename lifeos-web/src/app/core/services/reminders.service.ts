import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { ToastService } from './toast.service';
// Type-only: calendar.service imports this service, so a value import would be circular.
import type { EventRecurrence } from './calendar.service';

export type ReminderStatus = 'Pending' | 'Dismissed';

/** Types a reminder can be about (the linkable types, minus inbox items). Same strings as EntityLinks. */
export type ReminderTargetType =
  | 'Task'
  | 'Event'
  | 'Goal'
  | 'Project'
  | 'Habit'
  | 'JournalEntry'
  | 'Document'
  | 'Decision'
  | 'Skill'
  | 'Course'
  | 'Book'
  | 'Roadmap'
  | 'Certification'
  | 'KnowledgeNote'
  | 'Contact'
  | 'Employment'
  | 'CareerAchievement'
  | 'JobApplication'
  | 'InterviewQuestion'
  | 'ResumeVersion'
  | 'FinanceAccount'
  | 'Transaction'
  | 'Holding'
  | 'Loan'
  | 'InsurancePolicy'
  | 'TaxItem'
  | 'DoctorVisit'
  | 'Medication'
  | 'MedicalCondition'
  | 'LabResult'
  | 'Property'
  | 'Asset'
  | 'Vehicle'
  | 'Warranty'
  | 'MaintenanceTask';

/** How each target type reads in the UI ("About Journal entry: 15/Oct/2026"), not the stored type string. */
export const REMINDER_TARGET_LABELS: Record<ReminderTargetType, string> = {
  Task: 'Task',
  Event: 'Event',
  Goal: 'Goal',
  Project: 'Project',
  Habit: 'Habit',
  JournalEntry: 'Journal entry',
  Document: 'Document',
  Decision: 'Decision',
  Skill: 'Skill',
  Course: 'Course',
  Book: 'Book',
  Roadmap: 'Roadmap',
  Certification: 'Certification',
  KnowledgeNote: 'Note',
  Contact: 'Contact',
  Employment: 'Role',
  CareerAchievement: 'Career achievement',
  JobApplication: 'Job application',
  InterviewQuestion: 'Interview question',
  ResumeVersion: 'Resume version',
  FinanceAccount: 'Account',
  Transaction: 'Transaction',
  Holding: 'Investment',
  Loan: 'Loan',
  InsurancePolicy: 'Insurance policy',
  TaxItem: 'Tax item',
  DoctorVisit: 'Doctor visit',
  Medication: 'Medicine',
  MedicalCondition: 'Medical history',
  LabResult: 'Lab result',
  Property: 'Property',
  Asset: 'Belonging',
  Vehicle: 'Vehicle',
  Warranty: 'Warranty',
  MaintenanceTask: 'Maintenance',
};

export interface Reminder {
  id: number;
  title: string;
  notes: string | null;
  /** UTC ISO string. */
  remindAt: string;
  dismissedAt: string | null;
  entityType: ReminderTargetType | null;
  entityId: number | null;
  /** The target's current title. */
  entityTitle: string | null;
  /** Null = fires once. A repeating reminder's remindAt is its next time; "done" moves it on. */
  recurrence: EventRecurrence | null;
  /** IANA zone a repeating reminder follows. */
  timeZone: string | null;
  /** Written for one occurrence of a recurring event ("15 minutes before each"): that occurrence's day. */
  occurrenceDate: string | null;
  createdAt: string;
}

export interface ReminderPayload {
  title: string;
  notes: string | null;
  /** UTC ISO string with "Z" — the API rejects times without a timezone. */
  remindAt: string;
  recurrence: EventRecurrence | null;
  /** The browser's IANA zone — required for a repeating reminder. */
  timeZone: string | null;
  /** Only read on create: a reminder keeps its target. */
  entityType?: ReminderTargetType | null;
  entityId?: number | null;
}

/** How many newly-due reminders get a toast each; beyond that, one summary toast. */
const MAX_REMINDER_TOASTS = 3;

@Injectable({ providedIn: 'root' })
export class RemindersService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly baseUrl = '/api/Calendar/Reminders';

  // There's no job server: "due" is whatever the API says is due each time the shell asks (on load, every minute
  // and when the tab regains focus). The sidebar badge, My Day and the Reminders page all read this one list.
  private readonly dueSignal = signal<Reminder[]>([]);
  readonly due = this.dueSignal.asReadonly();

  // Bumped after every change, so open screens showing reminders can reload.
  private readonly changedVersionSignal = signal(0);
  readonly changedVersion = this.changedVersionSignal.asReadonly();

  /** Reminders already announced with a toast (by id + moment, so a snoozed one is announced again). */
  private readonly announced = new Set<string>();

  refreshDue(): void {
    this.http
      .get<ApiResponse<Reminder[]>>(`${this.baseUrl}/due`)
      .pipe(map((response) => response.data ?? []))
      .subscribe({
        next: (due) => {
          this.dueSignal.set(due);
          this.announce(due);
        },
        // Non-critical (a badge and toasts); the Reminders page reports its own load failures.
        error: () => undefined,
      });
  }

  /** Called on logout so the next user never sees the previous user's reminders. */
  reset(): void {
    this.dueSignal.set([]);
    this.announced.clear();
  }

  list(
    status: ReminderStatus,
    target?: { entityType: string; entityId: number },
  ): Observable<Reminder[]> {
    let params = new HttpParams().set('status', status);
    if (target) {
      params = params.set('entityType', target.entityType).set('entityId', target.entityId);
    }
    return this.http
      .get<ApiResponse<Reminder[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  create(payload: ReminderPayload): Observable<Reminder> {
    return this.http.post<ApiResponse<Reminder>>(this.baseUrl, payload).pipe(
      map((response) => response.data!),
      tap(() => this.notifyChanged()),
    );
  }

  update(id: number, payload: ReminderPayload): Observable<Reminder> {
    return this.http.put<ApiResponse<Reminder>>(`${this.baseUrl}/${id}`, payload).pipe(
      map((response) => response.data!),
      tap(() => this.notifyChanged()),
    );
  }

  setDismissed(id: number, dismissed: boolean): Observable<Reminder> {
    return this.http
      .put<ApiResponse<Reminder>>(`${this.baseUrl}/${id}/dismissed`, { dismissed })
      .pipe(
        map((response) => response.data!),
        tap(() => this.notifyChanged()),
      );
  }

  /** `until` is a UTC ISO string in the future. */
  snooze(id: number, until: string): Observable<Reminder> {
    return this.http.put<ApiResponse<Reminder>>(`${this.baseUrl}/${id}/snooze`, { until }).pipe(
      map((response) => response.data!),
      tap(() => this.notifyChanged()),
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      tap(() => this.notifyChanged()),
    );
  }

  /** Also for changes made elsewhere that affect reminders (deleting a target drops its reminders). */
  notifyChanged(): void {
    this.changedVersionSignal.update((v) => v + 1);
    this.refreshDue();
  }

  private announce(due: Reminder[]): void {
    const fresh = due.filter((r) => !this.announced.has(`${r.id}@${r.remindAt}`));
    fresh.forEach((r) => this.announced.add(`${r.id}@${r.remindAt}`));

    const shown =
      fresh.length > MAX_REMINDER_TOASTS ? fresh.slice(0, MAX_REMINDER_TOASTS - 1) : fresh;
    for (const reminder of shown) {
      this.toast.reminder(reminder.title);
    }
    if (shown.length < fresh.length) {
      this.toast.reminder(`${fresh.length - shown.length} more reminders are due.`);
    }
  }
}
