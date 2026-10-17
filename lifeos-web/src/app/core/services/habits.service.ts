import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

export const HABIT_STATUSES = ['Active', 'Archived'] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

/** Matches HabitLinkableProvider.Type on the API. */
export const HABIT_ENTITY_TYPE = 'Habit';

/** Computed by the API (HabitStreaks) as of the client's today — never worked out in the browser. */
export interface HabitStreak {
  current: number;
  longest: number;
  doneToday: boolean;
  dueToday: boolean;
  /** Most recent scheduled day before today that wasn't done, "yyyy-MM-dd". */
  lastMissed: string | null;
}

/** Build = something to do; Avoid = something to stop (its logged days are slips). */
export type HabitKind = 'Build' | 'Avoid';

/** An avoid habit's days in a row without a slip (HabitStreaks.CleanRuns); today counts while it's clean. */
export interface HabitCleanRun {
  current: number;
  longest: number;
  slippedToday: boolean;
  lastSlip: string | null;
}

export interface Habit {
  id: number;
  title: string;
  description: string | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  /** Weekday bitmask, ISO order: Monday = 1 ... Sunday = 64 (127 = every day). */
  scheduleDays: number;
  /** "yyyy-MM-dd". */
  startDate: string;
  status: HabitStatus;
  kind: HabitKind;
  /** Measurable build habits: what a day needs ("20" pages); null for a plain tick. */
  targetValue: number | null;
  unit: string | null;
  tags: { id: number; name: string }[];
  createdAt: string;
  /** Build habits only. */
  streak: HabitStreak;
  /** Avoid habits only. */
  cleanRun: HabitCleanRun | null;
  /** Build: days done inside the requested window (measurable: target met), "yyyy-MM-dd", oldest first. */
  doneDates: string[];
  /** Measurable: the value logged per day of the window, including days short of the target. */
  values: Record<string, number>;
  /** Avoid: the slips inside the window, oldest first. */
  slipDates: string[];
}

export interface HabitPayload {
  title: string;
  description: string | null;
  lifeAreaId: number | null;
  scheduleDays: number;
  startDate: string;
  kind: HabitKind;
  targetValue: number | null;
  unit: string | null;
  tagIds: number[];
}

export interface HabitEntryResult {
  entryDate: string;
  /** Build: the day counts. Avoid: the day is a slip. */
  done: boolean;
  /** Measurable: what's now logged for the day (null when nothing is). */
  value: number | null;
  streak: HabitStreak;
  cleanRun: HabitCleanRun | null;
}

/** A ready-made habit from the library (HabitTemplates on the API). */
export interface HabitTemplate {
  key: string;
  category: string;
  title: string;
  description: string;
  kind: HabitKind;
  targetValue: number | null;
  unit: string | null;
  scheduleDays: number;
  lifeAreaName: string;
}

@Injectable({ providedIn: 'root' })
export class HabitsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly baseUrl = '/api/Habits/Habits';

  /** Every habit, any status, with its streak as of `today` and the days done from `from` to today. */
  list(today: string, from: string): Observable<Habit[]> {
    const params = new HttpParams().set('today', today).set('from', from);
    return this.http
      .get<ApiResponse<Habit[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number, today: string, from: string): Observable<Habit> {
    const params = new HttpParams().set('today', today).set('from', from);
    return this.http
      .get<ApiResponse<Habit>>(`${this.baseUrl}/${id}`, { params })
      .pipe(map((response) => response.data!));
  }

  create(payload: HabitPayload, today: string): Observable<Habit> {
    return this.http
      .post<ApiResponse<Habit>>(this.baseUrl, { ...payload, today })
      .pipe(map((response) => response.data!));
  }

  update(id: number, payload: HabitPayload, today: string): Observable<Habit> {
    return this.http
      .put<ApiResponse<Habit>>(`${this.baseUrl}/${id}`, { ...payload, today })
      .pipe(map((response) => response.data!));
  }

  setStatus(id: number, status: HabitStatus, today: string): Observable<Habit> {
    return this.http
      .put<ApiResponse<Habit>>(`${this.baseUrl}/${id}/status`, { status, today })
      .pipe(map((response) => response.data!));
  }

  /**
   * Ticks (done) or un-ticks one day — a measurable habit logs `value` (its target when left out; 0 clears the day),
   * an avoid habit logs or removes a slip. The result carries the habit's new streak or clean run.
   */
  setEntry(
    id: number,
    date: string,
    done: boolean,
    today: string,
    value: number | null = null,
  ): Observable<HabitEntryResult> {
    return this.http
      .put<ApiResponse<HabitEntryResult>>(`${this.baseUrl}/${id}/entries/${date}`, {
        done,
        today,
        value,
      })
      .pipe(map((response) => response.data!));
  }

  /** The habit library. */
  templates(): Observable<HabitTemplate[]> {
    return this.http
      .get<ApiResponse<HabitTemplate[]>>(`${this.baseUrl}/templates`)
      .pipe(map((response) => response.data ?? []));
  }

  /** Deletes the habit with its ticked days, links and reminders. */
  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
