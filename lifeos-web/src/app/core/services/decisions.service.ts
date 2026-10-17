import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

/** Matches DecisionLinkableProvider.Type on the API. */
export const DECISION_ENTITY_TYPE = 'Decision';

/** How it turned out against what was expected (CK_Decisions_Verdict). */
export type DecisionVerdict = 'Better' | 'AsExpected' | 'Worse';

export interface Decision {
  id: number;
  decidedOn: string;
  title: string;
  reasons: string | null;
  expectedOutcome: string | null;
  /** The day to look back on it; a reminder fires at 9:00 that morning. */
  reviewOn: string | null;
  reviewReminderId: number | null;
  actualOutcome: string | null;
  verdict: DecisionVerdict | null;
  /** Set once the outcome is recorded. */
  reviewedOn: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface DecisionPayload {
  decidedOn: string;
  title: string;
  reasons: string | null;
  expectedOutcome: string | null;
  reviewOn: string | null;
  /** The browser's zone, for the review reminder's 9:00 when Settings has none. */
  timeZone: string | null;
}

export interface DecisionOutcomePayload {
  /** Blank reopens the decision. */
  actualOutcome: string | null;
  verdict: DecisionVerdict | null;
  today: string;
  timeZone: string | null;
}

/** The decision journal (api/Journal/Decisions). Saving can write, move or settle the review reminder. */
@Injectable({ providedIn: 'root' })
export class DecisionsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly baseUrl = '/api/Journal/Decisions';

  /** All decisions newest first, or only those made on `day`. */
  list(day?: string): Observable<Decision[]> {
    const params = day ? new HttpParams().set('day', day) : undefined;
    return this.http
      .get<ApiResponse<Decision[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<Decision> {
    return this.http
      .get<ApiResponse<Decision>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  create(payload: DecisionPayload): Observable<Decision> {
    return this.http.post<ApiResponse<Decision>>(this.baseUrl, payload).pipe(
      map((response) => response.data!),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  update(id: number, payload: DecisionPayload): Observable<Decision> {
    return this.http.put<ApiResponse<Decision>>(`${this.baseUrl}/${id}`, payload).pipe(
      map((response) => response.data!),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  recordOutcome(id: number, payload: DecisionOutcomePayload): Observable<Decision> {
    return this.http.put<ApiResponse<Decision>>(`${this.baseUrl}/${id}/outcome`, payload).pipe(
      map((response) => response.data!),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
