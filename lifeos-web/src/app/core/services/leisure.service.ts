import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

/** Match MediaItemLinkableProvider / HobbyLinkableProvider on the API (never rename). */
export const MEDIA_ITEM_ENTITY_TYPE = 'MediaItem';
export const HOBBY_ENTITY_TYPE = 'Hobby';

export const MEDIA_KINDS = ['Book', 'Film', 'Series', 'Game', 'Album', 'Podcast', 'Other'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** In the order the backlog shows them. */
export const MEDIA_STATUSES = ['InProgress', 'Want', 'Finished', 'Dropped'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export type MediaNoteKind = 'Note' | 'Highlight';
export type HobbyStatus = 'Active' | 'Archived';

export interface TagRef {
  id: number;
  name: string;
}

export interface MediaItem {
  id: number;
  kind: MediaKind;
  title: string;
  creator: string | null;
  whereToFind: string | null;
  status: MediaStatus;
  upNext: boolean;
  totalPages: number | null;
  currentPage: number;
  season: number | null;
  episode: number | null;
  /** Worked out by the API: a book's pages, 100 when finished, else null. */
  progressPercent: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null;
  review: string | null;
  skillId: number | null;
  skillName: string | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  tags: TagRef[];
  noteCount: number;
  logCount: number;
  minutesLogged: number;
}

export interface MediaNote {
  id: number;
  kind: MediaNoteKind;
  text: string;
  page: number | null;
  createdAt: string;
}

export interface MediaLog {
  id: number;
  loggedOn: string;
  minutes: number | null;
  note: string | null;
}

export interface MediaItemDetail extends MediaItem {
  notes: MediaNote[];
  logs: MediaLog[];
}

export interface MediaItemPayload {
  kind: MediaKind;
  title: string;
  creator: string | null;
  whereToFind: string | null;
  status: MediaStatus;
  upNext: boolean;
  totalPages: number | null;
  currentPage: number;
  season: number | null;
  episode: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null;
  review: string | null;
  skillId: number | null;
  lifeAreaId: number | null;
  tagIds: number[];
  today: string;
}

/** "I'm on page N" (a book) or "season S, episode E" (a show). */
export interface MediaProgressPayload {
  currentPage?: number;
  season?: number | null;
  episode?: number;
  today: string;
}

export interface MediaNotePayload {
  kind: MediaNoteKind;
  text: string;
  page: number | null;
}

export interface MediaLogPayload {
  loggedOn: string;
  minutes: number | null;
  note: string | null;
  today: string;
}

export interface YearInMedia {
  year: number;
  finished: number;
  minutes: number;
  byKind: { kind: MediaKind; finished: number; logged: number; minutes: number }[];
  topRated: {
    id: number;
    kind: MediaKind;
    title: string;
    creator: string | null;
    rating: number;
    finishedOn: string;
  }[];
  genres: { name: string; count: number }[];
  years: number[];
}

export interface Hobby {
  id: number;
  name: string;
  description: string | null;
  status: HobbyStatus;
  habitId: number | null;
  habitTitle: string | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  sessionCount: number;
  totalMinutes: number;
  lastPracticedOn: string | null;
}

export interface HobbySession {
  id: number;
  hobbyId: number;
  practicedOn: string;
  minutes: number;
  startedAt: string | null;
  note: string | null;
}

export interface HobbyDetail extends Hobby {
  sessions: HobbySession[];
}

export interface HobbyPayload {
  name: string;
  description: string | null;
  status: HobbyStatus;
  habitId: number | null;
  lifeAreaId: number | null;
}

export interface HobbySessionPayload {
  practicedOn: string;
  minutes: number;
  startedAt: string | null;
  note: string | null;
  today: string;
}

/** One month of hobby time (the 1st of the month), minutes per hobby practised that month. */
export interface HobbyMonth {
  month: string;
  hobbies: { hobbyId: number; minutes: number }[];
}

/** Leisure & media (Session 78b): the backlog (books included), notes, logs, hobbies and their time. */
@Injectable({ providedIn: 'root' })
export class LeisureService {
  private readonly http = inject(HttpClient);
  private readonly reminders = inject(RemindersService);
  private readonly base = '/api/Leisure';

  mediaItems(kind?: MediaKind | null): Observable<MediaItem[]> {
    const params: Record<string, string> = kind ? { kind } : {};
    return this.http
      .get<ApiResponse<MediaItem[]>>(`${this.base}/MediaItems`, { params })
      .pipe(map((r) => r.data ?? []));
  }

  mediaItem(id: number): Observable<MediaItemDetail> {
    return this.http
      .get<ApiResponse<MediaItemDetail>>(`${this.base}/MediaItems/${id}`)
      .pipe(map((r) => r.data!));
  }

  saveMediaItem(id: number | null, payload: MediaItemPayload): Observable<MediaItemDetail> {
    const request = id
      ? this.http.put<ApiResponse<MediaItemDetail>>(`${this.base}/MediaItems/${id}`, payload)
      : this.http.post<ApiResponse<MediaItemDetail>>(`${this.base}/MediaItems`, payload);
    return request.pipe(map((r) => r.data!));
  }

  /** Turns an inbox idea into a media item (its links move along; the inbox item is marked processed). */
  createFromInbox(inboxItemId: number, payload: MediaItemPayload): Observable<MediaItemDetail> {
    return this.http
      .post<ApiResponse<MediaItemDetail>>(
        `${this.base}/MediaItems/from-inbox/${inboxItemId}`,
        payload,
      )
      .pipe(map((r) => r.data!));
  }

  setProgress(id: number, payload: MediaProgressPayload): Observable<MediaItemDetail> {
    return this.http
      .put<ApiResponse<MediaItemDetail>>(`${this.base}/MediaItems/${id}/progress`, payload)
      .pipe(map((r) => r.data!));
  }

  removeMediaItem(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/MediaItems/${id}`).pipe(
      map(() => undefined),
      tap(() => this.reminders.notifyChanged()),
    );
  }

  saveNote(
    itemId: number,
    noteId: number | null,
    payload: MediaNotePayload,
  ): Observable<MediaNote> {
    const request = noteId
      ? this.http.put<ApiResponse<MediaNote>>(
          `${this.base}/MediaItems/${itemId}/notes/${noteId}`,
          payload,
        )
      : this.http.post<ApiResponse<MediaNote>>(`${this.base}/MediaItems/${itemId}/notes`, payload);
    return request.pipe(map((r) => r.data!));
  }

  removeNote(itemId: number, noteId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/MediaItems/${itemId}/notes/${noteId}`)
      .pipe(map(() => undefined));
  }

  addLog(itemId: number, payload: MediaLogPayload): Observable<MediaLog> {
    return this.http
      .post<ApiResponse<MediaLog>>(`${this.base}/MediaItems/${itemId}/logs`, payload)
      .pipe(map((r) => r.data!));
  }

  removeLog(itemId: number, logId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/MediaItems/${itemId}/logs/${logId}`)
      .pipe(map(() => undefined));
  }

  yearInMedia(year: number): Observable<YearInMedia> {
    return this.http
      .get<ApiResponse<YearInMedia>>(`${this.base}/MediaItems/year/${year}`)
      .pipe(map((r) => r.data!));
  }

  hobbies(): Observable<Hobby[]> {
    return this.http
      .get<ApiResponse<Hobby[]>>(`${this.base}/Hobbies`)
      .pipe(map((r) => r.data ?? []));
  }

  hobby(id: number): Observable<HobbyDetail> {
    return this.http
      .get<ApiResponse<HobbyDetail>>(`${this.base}/Hobbies/${id}`)
      .pipe(map((r) => r.data!));
  }

  hobbyTime(today: string, months: number): Observable<HobbyMonth[]> {
    return this.http
      .get<ApiResponse<HobbyMonth[]>>(`${this.base}/Hobbies/time`, {
        params: { today, months: String(months) },
      })
      .pipe(map((r) => r.data ?? []));
  }

  saveHobby(id: number | null, payload: HobbyPayload): Observable<HobbyDetail> {
    const request = id
      ? this.http.put<ApiResponse<HobbyDetail>>(`${this.base}/Hobbies/${id}`, payload)
      : this.http.post<ApiResponse<HobbyDetail>>(`${this.base}/Hobbies`, payload);
    return request.pipe(map((r) => r.data!));
  }

  removeHobby(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Hobbies/${id}`).pipe(
      map(() => undefined),
      tap(() => this.reminders.notifyChanged()),
    );
  }

  addSession(hobbyId: number, payload: HobbySessionPayload): Observable<HobbySession> {
    return this.http
      .post<ApiResponse<HobbySession>>(`${this.base}/Hobbies/${hobbyId}/sessions`, payload)
      .pipe(map((r) => r.data!));
  }

  removeSession(hobbyId: number, sessionId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/Hobbies/${hobbyId}/sessions/${sessionId}`)
      .pipe(map(() => undefined));
  }
}
