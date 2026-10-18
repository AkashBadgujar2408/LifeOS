import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

/** Match SkillLinkableProvider / CourseLinkableProvider / BookLinkableProvider on the API. */
export const SKILL_ENTITY_TYPE = 'Skill';
export const COURSE_ENTITY_TYPE = 'Course';
export const BOOK_ENTITY_TYPE = 'Book';

export const COURSE_STATUSES = ['InProgress', 'Planned', 'Completed', 'Dropped'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const BOOK_STATUSES = ['Reading', 'WantToRead', 'Finished', 'Abandoned'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export type BookNoteKind = 'Note' | 'Highlight';
export type Proficiency = 1 | 2 | 3 | 4 | 5;

export interface Skill {
  id: number;
  name: string;
  description: string | null;
  proficiency: Proficiency;
  targetProficiency: Proficiency | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  tags: Tag[];
  courseCount: number;
  bookCount: number;
  /** "yyyy-MM-dd": the day it reached its current level. */
  levelSince: string | null;
}

export interface SkillLevelChange {
  id: number;
  /** Null on the first row: where the skill started. */
  fromProficiency: Proficiency | null;
  toProficiency: Proficiency;
  changedOn: string;
  note: string | null;
}

export interface LearningItem {
  id: number;
  title: string;
  status: string;
}

export interface SkillDetail extends Skill {
  /** Newest first. */
  history: SkillLevelChange[];
  courses: LearningItem[];
  books: LearningItem[];
}

export interface SkillPayload {
  name: string;
  description: string | null;
  proficiency: Proficiency;
  targetProficiency: Proficiency | null;
  lifeAreaId: number | null;
  tagIds: number[];
  /** The user's local day, for the level change it may record. */
  today: string;
  levelNote: string | null;
}

export interface Course {
  id: number;
  title: string;
  provider: string | null;
  url: string | null;
  status: CourseStatus;
  progressPercent: number;
  startedOn: string | null;
  completedOn: string | null;
  notes: string | null;
  skillId: number | null;
  skillName: string | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
}

export interface CoursePayload {
  title: string;
  provider: string | null;
  url: string | null;
  status: CourseStatus;
  progressPercent: number;
  startedOn: string | null;
  completedOn: string | null;
  notes: string | null;
  skillId: number | null;
  lifeAreaId: number | null;
  today: string;
}

export interface Book {
  id: number;
  title: string;
  author: string | null;
  status: BookStatus;
  totalPages: number | null;
  currentPage: number;
  /** Worked out by the API; null without a page count. */
  progressPercent: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null;
  skillId: number | null;
  skillName: string | null;
  lifeAreaId: number | null;
  lifeAreaName: string | null;
  tags: Tag[];
  noteCount: number;
}

export interface BookNote {
  id: number;
  kind: BookNoteKind;
  text: string;
  page: number | null;
  createdAt: string;
}

export interface BookDetail extends Book {
  /** By page, unpaged last. */
  notes: BookNote[];
}

export interface BookPayload {
  title: string;
  author: string | null;
  status: BookStatus;
  totalPages: number | null;
  currentPage: number;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null;
  skillId: number | null;
  lifeAreaId: number | null;
  tagIds: number[];
  today: string;
}

export interface BookNotePayload {
  kind: BookNoteKind;
  text: string;
  page: number | null;
}

/** The Learning API: skills (with level history), courses, and the reading list with notes. */
@Injectable({ providedIn: 'root' })
export class LearningService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Learning';

  skills(): Observable<Skill[]> {
    return this.http
      .get<ApiResponse<Skill[]>>(`${this.base}/Skills`)
      .pipe(map((response) => response.data ?? []));
  }

  skill(id: number): Observable<SkillDetail> {
    return this.http
      .get<ApiResponse<SkillDetail>>(`${this.base}/Skills/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveSkill(id: number | null, payload: SkillPayload): Observable<SkillDetail> {
    const request = id
      ? this.http.put<ApiResponse<SkillDetail>>(`${this.base}/Skills/${id}`, payload)
      : this.http.post<ApiResponse<SkillDetail>>(`${this.base}/Skills`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeSkill(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Skills/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  courses(status?: CourseStatus): Observable<Course[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http
      .get<ApiResponse<Course[]>>(`${this.base}/Courses`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  course(id: number): Observable<Course> {
    return this.http
      .get<ApiResponse<Course>>(`${this.base}/Courses/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveCourse(id: number | null, payload: CoursePayload): Observable<Course> {
    const request = id
      ? this.http.put<ApiResponse<Course>>(`${this.base}/Courses/${id}`, payload)
      : this.http.post<ApiResponse<Course>>(`${this.base}/Courses`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeCourse(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Courses/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  books(status?: BookStatus): Observable<Book[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http
      .get<ApiResponse<Book[]>>(`${this.base}/Books`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  book(id: number): Observable<BookDetail> {
    return this.http
      .get<ApiResponse<BookDetail>>(`${this.base}/Books/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveBook(id: number | null, payload: BookPayload): Observable<BookDetail> {
    const request = id
      ? this.http.put<ApiResponse<BookDetail>>(`${this.base}/Books/${id}`, payload)
      : this.http.post<ApiResponse<BookDetail>>(`${this.base}/Books`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** "I'm on page N": starts a book not yet started, finishes it on the last page. */
  setBookPage(id: number, currentPage: number, today: string): Observable<BookDetail> {
    return this.http
      .put<ApiResponse<BookDetail>>(`${this.base}/Books/${id}/progress`, { currentPage, today })
      .pipe(map((response) => response.data!));
  }

  removeBook(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Books/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  saveBookNote(
    bookId: number,
    noteId: number | null,
    payload: BookNotePayload,
  ): Observable<BookNote> {
    const request = noteId
      ? this.http.put<ApiResponse<BookNote>>(
          `${this.base}/Books/${bookId}/notes/${noteId}`,
          payload,
        )
      : this.http.post<ApiResponse<BookNote>>(`${this.base}/Books/${bookId}/notes`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeBookNote(bookId: number, noteId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/Books/${bookId}/notes/${noteId}`)
      .pipe(map(() => undefined));
  }
}
