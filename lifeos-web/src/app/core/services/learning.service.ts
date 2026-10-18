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

export const ROADMAP_ENTITY_TYPE = 'Roadmap';
export const CERTIFICATION_ENTITY_TYPE = 'Certification';

export const ROADMAP_STATUSES = ['Active', 'Completed', 'Archived'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type RoadmapStepTarget = 'Course' | 'Book' | 'Goal';

export interface Roadmap {
  id: number;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  goalId: number | null;
  goalTitle: string | null;
  stepCount: number;
  completedStepCount: number;
  /** Worked out by the API. */
  progressPercent: number;
  nextStepTitle: string | null;
}

export interface RoadmapStep {
  id: number;
  title: string;
  sortOrder: number;
  completedAt: string | null;
  targetType: RoadmapStepTarget | null;
  targetId: number | null;
  targetTitle: string | null;
  /** The course's / book's / goal's own status. */
  targetStatus: string | null;
}

export interface RoadmapDetail extends Roadmap {
  steps: RoadmapStep[];
}

export interface RoadmapPayload {
  title: string;
  description: string | null;
  status: RoadmapStatus;
  goalId: number | null;
}

export interface RoadmapStepPayload {
  title: string;
  targetType: RoadmapStepTarget | null;
  targetId: number | null;
}

export interface StepCompletedResult {
  roadmap: RoadmapDetail;
  /** Set when this tick finished the roadmap (or the untick reopened it). */
  statusChangedTo: RoadmapStatus | null;
}

export interface StudySession {
  id: number;
  /** Local day, "yyyy-MM-dd". */
  studiedOn: string;
  minutes: number;
  topic: string | null;
  skillId: number | null;
  skillName: string | null;
  courseId: number | null;
  courseTitle: string | null;
  bookId: number | null;
  bookTitle: string | null;
  /** Set when the timer logged it. */
  startedAt: string | null;
  notes: string | null;
}

export interface StudySessionPayload {
  studiedOn: string;
  minutes: number;
  topic: string | null;
  skillId: number | null;
  courseId: number | null;
  bookId: number | null;
  startedAt: string | null;
  notes: string | null;
  today: string;
}

export interface Certification {
  id: number;
  name: string;
  issuer: string | null;
  credentialId: string | null;
  url: string | null;
  issuedOn: string;
  expiresOn: string | null;
  renewalReminderDays: number | null;
  skillId: number | null;
  skillName: string | null;
  courseId: number | null;
  courseTitle: string | null;
}

export interface CertificationPayload {
  name: string;
  issuer: string | null;
  credentialId: string | null;
  url: string | null;
  issuedOn: string;
  expiresOn: string | null;
  renewalReminderDays: number | null;
  skillId: number | null;
  courseId: number | null;
  timeZone: string;
}

export interface KnowledgeNote {
  id: number;
  title: string;
  content: string | null;
  skillId: number | null;
  skillName: string | null;
  /** Good reviews in a row (0 = new). */
  reviewStage: number;
  /** Null = not in the revision planner. */
  nextReviewOn: string | null;
  lastReviewedOn: string | null;
  updatedAt: string;
}

export interface KnowledgeNotePayload {
  title: string;
  content: string | null;
  skillId: number | null;
  /** Keep it in the revision planner (turning it on asks for it tomorrow). */
  review: boolean;
  today: string;
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

  // ---- Roadmaps ----

  roadmaps(): Observable<Roadmap[]> {
    return this.http
      .get<ApiResponse<Roadmap[]>>(`${this.base}/Roadmaps`)
      .pipe(map((response) => response.data ?? []));
  }

  roadmap(id: number): Observable<RoadmapDetail> {
    return this.http
      .get<ApiResponse<RoadmapDetail>>(`${this.base}/Roadmaps/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveRoadmap(id: number | null, payload: RoadmapPayload): Observable<RoadmapDetail> {
    const request = id
      ? this.http.put<ApiResponse<RoadmapDetail>>(`${this.base}/Roadmaps/${id}`, payload)
      : this.http.post<ApiResponse<RoadmapDetail>>(`${this.base}/Roadmaps`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeRoadmap(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Roadmaps/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  saveRoadmapStep(
    roadmapId: number,
    stepId: number | null,
    payload: RoadmapStepPayload,
  ): Observable<RoadmapDetail> {
    const url = `${this.base}/Roadmaps/${roadmapId}/steps`;
    const request = stepId
      ? this.http.put<ApiResponse<RoadmapDetail>>(`${url}/${stepId}`, payload)
      : this.http.post<ApiResponse<RoadmapDetail>>(url, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Ticks or unticks a step; the last open step finishes the roadmap, unticking one reopens it. */
  setRoadmapStepCompleted(
    roadmapId: number,
    stepId: number,
    completed: boolean,
  ): Observable<StepCompletedResult> {
    return this.http
      .put<ApiResponse<StepCompletedResult>>(
        `${this.base}/Roadmaps/${roadmapId}/steps/${stepId}/completed`,
        { completed },
      )
      .pipe(map((response) => response.data!));
  }

  reorderRoadmapSteps(roadmapId: number, stepIds: number[]): Observable<RoadmapDetail> {
    return this.http
      .put<ApiResponse<RoadmapDetail>>(`${this.base}/Roadmaps/${roadmapId}/steps/order`, {
        stepIds,
      })
      .pipe(map((response) => response.data!));
  }

  removeRoadmapStep(roadmapId: number, stepId: number): Observable<RoadmapDetail> {
    return this.http
      .delete<ApiResponse<RoadmapDetail>>(`${this.base}/Roadmaps/${roadmapId}/steps/${stepId}`)
      .pipe(map((response) => response.data!));
  }

  // ---- Study sessions ----

  /** Sessions on local days `from`..`to`, newest first. */
  studySessions(from: string, to: string): Observable<StudySession[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http
      .get<ApiResponse<StudySession[]>>(`${this.base}/StudySessions`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  saveStudySession(id: number | null, payload: StudySessionPayload): Observable<StudySession> {
    const request = id
      ? this.http.put<ApiResponse<StudySession>>(`${this.base}/StudySessions/${id}`, payload)
      : this.http.post<ApiResponse<StudySession>>(`${this.base}/StudySessions`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeStudySession(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/StudySessions/${id}`)
      .pipe(map(() => undefined));
  }

  // ---- Certifications ----

  certifications(): Observable<Certification[]> {
    return this.http
      .get<ApiResponse<Certification[]>>(`${this.base}/Certifications`)
      .pipe(map((response) => response.data ?? []));
  }

  certification(id: number): Observable<Certification> {
    return this.http
      .get<ApiResponse<Certification>>(`${this.base}/Certifications/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveCertification(id: number | null, payload: CertificationPayload): Observable<Certification> {
    const request = id
      ? this.http.put<ApiResponse<Certification>>(`${this.base}/Certifications/${id}`, payload)
      : this.http.post<ApiResponse<Certification>>(`${this.base}/Certifications`, payload);
    // The renewal reminder is written or moved with it.
    return request.pipe(
      map((response) => response.data!),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  removeCertification(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Certifications/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  // ---- Knowledge notes + revision planner ----

  knowledgeNotes(): Observable<KnowledgeNote[]> {
    return this.http
      .get<ApiResponse<KnowledgeNote[]>>(`${this.base}/KnowledgeNotes`)
      .pipe(map((response) => response.data ?? []));
  }

  saveKnowledgeNote(id: number | null, payload: KnowledgeNotePayload): Observable<KnowledgeNote> {
    const request = id
      ? this.http.put<ApiResponse<KnowledgeNote>>(`${this.base}/KnowledgeNotes/${id}`, payload)
      : this.http.post<ApiResponse<KnowledgeNote>>(`${this.base}/KnowledgeNotes`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Records today's review and schedules the next one. */
  reviewKnowledgeNote(id: number, remembered: boolean, today: string): Observable<KnowledgeNote> {
    return this.http
      .post<ApiResponse<KnowledgeNote>>(`${this.base}/KnowledgeNotes/${id}/review`, {
        remembered,
        today,
      })
      .pipe(map((response) => response.data!));
  }

  removeKnowledgeNote(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/KnowledgeNotes/${id}`)
      .pipe(map(() => undefined));
  }
}
