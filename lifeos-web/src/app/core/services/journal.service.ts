import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

/** Matches JournalEntryLinkableProvider.Type on the API. */
export const JOURNAL_ENTRY_ENTITY_TYPE = 'JournalEntry';

/** 1 (awful) to 5 (great). */
export type Mood = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: number;
  /** The day it's about, "yyyy-MM-dd". */
  entryDate: string;
  title: string | null;
  content: string | null;
  mood: Mood | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface JournalEntryPayload {
  title: string | null;
  content: string | null;
  mood: Mood | null;
  lifeAreaId: number | null;
}

export interface MoodPoint {
  entryDate: string;
  mood: Mood;
}

export interface WeeklyReflection {
  weekStartDate: string;
  wentWell: string | null;
  wasHard: string | null;
  nextFocus: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface JournalDaySummary {
  entryDate: string;
  title: string | null;
  mood: Mood | null;
  excerpt: string | null;
}

export interface WeeklyReview {
  weekStartDate: string;
  weekEndDate: string;
  reflection: WeeklyReflection | null;
  days: JournalDaySummary[];
}

export interface WeeklyReflectionPayload {
  wentWell: string | null;
  wasHard: string | null;
  nextFocus: string | null;
}

@Injectable({ providedIn: 'root' })
export class JournalService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly entriesUrl = '/api/Journal/Entries';
  private readonly reflectionsUrl = '/api/Journal/Reflections';

  /** Entries from `from` to `to` ("yyyy-MM-dd"), newest first. */
  list(from: string, to: string): Observable<JournalEntry[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http
      .get<ApiResponse<JournalEntry[]>>(this.entriesUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<JournalEntry> {
    return this.http
      .get<ApiResponse<JournalEntry>>(`${this.entriesUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  /** The day's entry, or null when nothing was written that day. */
  getForDay(day: string): Observable<JournalEntry | null> {
    return this.http
      .get<ApiResponse<JournalEntry | null>>(`${this.entriesUrl}/day/${day}`)
      .pipe(map((response) => response.data));
  }

  /** Creates or rewrites the day's entry (one per day). */
  saveForDay(day: string, payload: JournalEntryPayload): Observable<JournalEntry> {
    return this.http
      .put<ApiResponse<JournalEntry>>(`${this.entriesUrl}/day/${day}`, payload)
      .pipe(map((response) => response.data!));
  }

  removeForDay(day: string): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.entriesUrl}/day/${day}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  /** Turns a captured Journal inbox item into that day's entry (appended if the day has one). */
  createFromInbox(inboxItemId: number, entryDate: string): Observable<JournalEntry> {
    return this.http
      .post<ApiResponse<JournalEntry>>(`${this.entriesUrl}/from-inbox/${inboxItemId}`, {
        entryDate,
      })
      .pipe(map((response) => response.data!));
  }

  /** Days with a mood from `from` to `to`, oldest first. */
  moods(from: string, to: string): Observable<MoodPoint[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http
      .get<ApiResponse<MoodPoint[]>>(`${this.entriesUrl}/moods`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  getWeek(weekStart: string): Observable<WeeklyReview> {
    return this.http
      .get<ApiResponse<WeeklyReview>>(`${this.reflectionsUrl}/${weekStart}`)
      .pipe(map((response) => response.data!));
  }

  /** Saves the week's answers; all three blank removes the saved reflection. */
  saveWeek(weekStart: string, payload: WeeklyReflectionPayload): Observable<WeeklyReview> {
    return this.http
      .put<ApiResponse<WeeklyReview>>(`${this.reflectionsUrl}/${weekStart}`, payload)
      .pipe(map((response) => response.data!));
  }
}
