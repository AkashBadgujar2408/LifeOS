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
  createdAt: string;
  streak: HabitStreak;
  /** Days done inside the requested window, "yyyy-MM-dd", oldest first. */
  doneDates: string[];
}

export interface HabitPayload {
  title: string;
  description: string | null;
  lifeAreaId: number | null;
  scheduleDays: number;
  startDate: string;
}

export interface HabitEntryResult {
  entryDate: string;
  done: boolean;
  streak: HabitStreak;
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

  /** Ticks (done) or un-ticks one day; the result carries the habit's new streak. */
  setEntry(id: number, date: string, done: boolean, today: string): Observable<HabitEntryResult> {
    return this.http
      .put<ApiResponse<HabitEntryResult>>(`${this.baseUrl}/${id}/entries/${date}`, { done, today })
      .pipe(map((response) => response.data!));
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
