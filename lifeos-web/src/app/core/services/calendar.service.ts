import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { RecurrenceFrequency } from './tasks.service';

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
  /** Events only: one occurrence of a recurring series (sourceId is the series). */
  isRecurring: boolean;
  /** Recurring events only: the day this occurrence starts — how the series names it. */
  occurrenceDate: string | null;
  /** Events only: the life area the time is for (time blocking). */
  lifeAreaId: number | null;
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
  /** Null for a one-off event; for a series the dates above are its first occurrence. */
  recurrence: EventRecurrence | null;
  /** IANA zone a timed series follows. */
  timeZone: string | null;
  /** Timed series: remind this many minutes before each occurrence (0 = as it starts); null = no. */
  reminderMinutesBefore: number | null;
  /** Skipped occurrences of the series ("yyyy-MM-dd"), oldest first. */
  skippedDates: string[];
  /** The life area the time is for (time blocking); null = none. */
  lifeAreaId: number | null;
  createdAt: string;
}

/** "Every {interval} {frequency}" from the first occurrence, until {until} (inclusive) or forever. */
export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  until: string | null;
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
  recurrence: EventRecurrence | null;
  /** The browser's IANA zone — the API needs it for a repeating timed event. */
  timeZone: string | null;
  /** Timed repeating events only. */
  reminderMinutesBefore: number | null;
  lifeAreaId: number | null;
}

/** New dates/times from a drag or resize (one of the two pairs, like the payload). */
export interface EventSchedule {
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export type EventMoveScope = 'One' | 'Series';

export interface EventMove extends EventSchedule {
  /** Recurring events: the occurrence that was dragged, and whether only it moves. */
  occurrenceDate: string | null;
  scope: EventMoveScope | null;
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

  /** Skip one occurrence of a series, or restore it. Returns the series. */
  setSkipped(id: number, occurrenceDate: string, skipped: boolean): Observable<CalendarEvent> {
    return this.http
      .put<ApiResponse<CalendarEvent>>(`${this.occurrenceUrl(id, occurrenceDate)}/skipped`, {
        skipped,
      })
      .pipe(map((response) => response.data!));
  }

  /** "Change just this one": the occurrence becomes the given one-off event; the series skips that day. */
  detachOccurrence(
    id: number,
    occurrenceDate: string,
    payload: CalendarEventPayload,
  ): Observable<CalendarEvent> {
    return this.http
      .post<ApiResponse<CalendarEvent>>(`${this.occurrenceUrl(id, occurrenceDate)}/detach`, payload)
      .pipe(map((response) => response.data!));
  }

  /** "Delete this and following". Emits true when that removed the whole series. */
  endSeries(id: number, occurrenceDate: string): Observable<boolean> {
    return this.http
      .post<ApiResponse<boolean>>(`${this.occurrenceUrl(id, occurrenceDate)}/end`, {})
      .pipe(
        map((response) => response.data!),
        // A removed series takes its reminders with it.
        tap((deleted) => {
          if (deleted) {
            this.remindersService.notifyChanged();
          }
        }),
      );
  }

  /**
   * A drag or resize. A one-off event just takes the new times; an occurrence of a series moves alone (it becomes a
   * one-off, like "change just this one") or takes the whole series with it. Emits the event that now has them.
   */
  moveEvent(id: number, move: EventMove): Observable<CalendarEvent> {
    return this.http
      .put<ApiResponse<CalendarEvent>>(`/api/Calendar/Events/${id}/move`, move)
      .pipe(map((response) => response.data!));
  }

  private occurrenceUrl(id: number, occurrenceDate: string): string {
    return `/api/Calendar/Events/${id}/occurrences/${occurrenceDate}`;
  }
}
