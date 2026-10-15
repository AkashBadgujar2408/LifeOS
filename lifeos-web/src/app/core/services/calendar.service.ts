import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

/** Matches EventLinkableProvider.Type on the API. */
export const EVENT_ENTITY_TYPE = 'Event';

export type CalendarSourceType = 'Event' | 'Task' | 'Milestone' | 'Goal';

/**
 * One thing on the calendar, from any module. Date-based items have startDate/endDate ("yyyy-MM-dd", endDate
 * inclusive); timed events have startsAt/endsAt (UTC ISO strings).
 */
export interface CalendarFeedItem {
  sourceType: CalendarSourceType;
  sourceId: number;
  title: string;
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isDone: boolean;
  priority: string | null;
  /** The goal a milestone belongs to, or the project a task is in. */
  parentId: number | null;
  parentTitle: string | null;
  location: string | null;
}

/** The feed's range: the user's local days, plus the same span as UTC instants (see calendar-feed.ts). */
export interface FeedRange {
  from: string;
  to: string;
  fromUtc: string;
  toUtc: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  notes: string | null;
  location: string | null;
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface CalendarEventPayload {
  title: string;
  notes: string | null;
  location: string | null;
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  /** UTC ISO string with "Z" — the API rejects times without a timezone. */
  startsAt: string | null;
  endsAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);

  feed(range: FeedRange): Observable<CalendarFeedItem[]> {
    const params = new HttpParams({ fromObject: { ...range } });
    return this.http
      .get<ApiResponse<CalendarFeedItem[]>>('/api/Calendar/Feed', { params })
      .pipe(map((response) => response.data ?? []));
  }

  getEvent(id: number): Observable<CalendarEvent> {
    return this.http
      .get<ApiResponse<CalendarEvent>>(`/api/Calendar/Events/${id}`)
      .pipe(map((response) => response.data!));
  }

  createEvent(payload: CalendarEventPayload): Observable<CalendarEvent> {
    return this.http
      .post<ApiResponse<CalendarEvent>>('/api/Calendar/Events', payload)
      .pipe(map((response) => response.data!));
  }

  updateEvent(id: number, payload: CalendarEventPayload): Observable<CalendarEvent> {
    return this.http
      .put<ApiResponse<CalendarEvent>>(`/api/Calendar/Events/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  deleteEvent(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`/api/Calendar/Events/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
