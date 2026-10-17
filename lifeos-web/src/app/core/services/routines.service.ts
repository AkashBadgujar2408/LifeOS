import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import { HabitEntryResult } from './habits.service';

/** An ordered group of build habits done together (Morning, Evening, Weekend). */
export interface Routine {
  id: number;
  name: string;
  sortOrder: number;
  /** In the routine's order. */
  habitIds: number[];
}

export interface RoutineTickResult {
  results: { habitId: number; result: HabitEntryResult }[];
  /** Habits left alone: not due that day, archived, or already as asked. */
  skipped: number[];
}

@Injectable({ providedIn: 'root' })
export class RoutinesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Habits/Routines';

  list(): Observable<Routine[]> {
    return this.http
      .get<ApiResponse<Routine[]>>(this.baseUrl)
      .pipe(map((response) => response.data ?? []));
  }

  create(name: string, habitIds: number[]): Observable<Routine> {
    return this.http
      .post<ApiResponse<Routine>>(this.baseUrl, { name, habitIds })
      .pipe(map((response) => response.data!));
  }

  update(id: number, name: string, habitIds: number[]): Observable<Routine> {
    return this.http
      .put<ApiResponse<Routine>>(`${this.baseUrl}/${id}`, { name, habitIds })
      .pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`)
      .pipe(map(() => undefined));
  }

  /** Ticks (or un-ticks) every habit in the routine that's due on `date`. */
  setDone(id: number, date: string, done: boolean, today: string): Observable<RoutineTickResult> {
    return this.http
      .put<ApiResponse<RoutineTickResult>>(`${this.baseUrl}/${id}/done/${date}`, { done, today })
      .pipe(map((response) => response.data!));
  }
}
