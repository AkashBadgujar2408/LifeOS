import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

export const EMPLOYMENT_ENTITY_TYPE = 'Employment';
export const CAREER_ACHIEVEMENT_ENTITY_TYPE = 'CareerAchievement';

export const EMPLOYMENT_TYPES = [
  'FullTime',
  'PartTime',
  'Contract',
  'Freelance',
  'Internship',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SALARY_PERIODS = ['Year', 'Month', 'Hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SALARY_REASONS = ['Starting', 'Raise', 'Promotion', 'Adjustment', 'Other'] as const;
export type SalaryReason = (typeof SALARY_REASONS)[number];

export const ACHIEVEMENT_KINDS = [
  'Project',
  'Promotion',
  'Award',
  'Contribution',
  'Other',
] as const;
export type CareerAchievementKind = (typeof ACHIEVEMENT_KINDS)[number];

/** A role at an organisation; `endDate` null = still in it. */
export interface Employment {
  id: number;
  organisation: string;
  role: string;
  employmentType: EmploymentType;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  achievementCount: number;
}

export interface EmploymentPayload {
  organisation: string;
  role: string;
  employmentType: EmploymentType;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  today: string;
}

export interface SalaryAmount {
  amount: number;
  currency: string;
  period: SalaryPeriod;
}

export interface PromotionPayload {
  newRole: string;
  on: string;
  note: string | null;
  /** Null leaves the salary history alone. */
  salary: SalaryAmount | null;
  today: string;
}

export interface PromotionResult {
  previousRole: Employment;
  newRole: Employment;
  achievementId: number;
  salaryRecordId: number | null;
}

export interface SalaryRecord {
  id: number;
  employmentId: number | null;
  organisation: string | null;
  role: string | null;
  effectiveOn: string;
  amount: number;
  currency: string;
  period: SalaryPeriod;
  reason: SalaryReason;
  note: string | null;
  /** Change from the previous record in the same currency and period, in %; null for the first one. */
  changePercent: number | null;
}

export interface SalaryRecordPayload {
  employmentId: number | null;
  effectiveOn: string;
  amount: number;
  currency: string;
  period: SalaryPeriod;
  reason: SalaryReason;
  note: string | null;
  today: string;
}

export interface CareerAchievement {
  id: number;
  employmentId: number | null;
  organisation: string | null;
  role: string | null;
  kind: CareerAchievementKind;
  title: string;
  achievedOn: string;
  description: string | null;
}

export interface CareerAchievementPayload {
  employmentId: number | null;
  kind: CareerAchievementKind;
  title: string;
  achievedOn: string;
  description: string | null;
  today: string;
}

export const JOB_APPLICATION_ENTITY_TYPE = 'JobApplication';
export const INTERVIEW_QUESTION_ENTITY_TYPE = 'InterviewQuestion';

export const APPLICATION_STAGES = [
  'Saved',
  'Applied',
  'Interview',
  'Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const INTERVIEW_OUTCOMES = ['Passed', 'Failed'] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export interface JobApplication {
  id: number;
  organisation: string;
  role: string;
  stage: ApplicationStage;
  appliedOn: string | null;
  closedOn: string | null;
  /** The day it reached its current stage. */
  stageSince: string | null;
  source: string | null;
  url: string | null;
  contactId: number | null;
  contactName: string | null;
  resumeVersionId: number | null;
  resumeVersionName: string | null;
  notes: string | null;
  interviewCount: number;
  /** The earliest scheduled round that hasn't ended (UTC). */
  nextInterviewAt: string | null;
}

export interface ApplicationStageChange {
  id: number;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  changedOn: string;
  note: string | null;
}

export interface JobApplicationDetail extends JobApplication {
  /** Oldest first. */
  history: ApplicationStageChange[];
  interviews: Interview[];
}

export interface JobApplicationPayload {
  organisation: string;
  role: string;
  source: string | null;
  url: string | null;
  contactId: number | null;
  resumeVersionId: number | null;
  notes: string | null;
  /** Create only: where it starts and the day it got there. */
  stage?: ApplicationStage;
  stageOn?: string | null;
  today: string;
}

export interface Interview {
  id: number;
  jobApplicationId: number;
  title: string;
  /** Its calendar entry; null while unscheduled. */
  eventId: number | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  prepNotes: string | null;
  reviewNotes: string | null;
  outcome: InterviewOutcome | null;
}

/** Both times (UTC) to put it on the calendar, neither to leave it unscheduled. */
export interface InterviewPayload {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  prepNotes: string | null;
  reviewNotes: string | null;
  outcome: InterviewOutcome | null;
}

export interface StageMovePayload {
  stage: ApplicationStage;
  on: string;
  note: string | null;
  /** Only with a move to Interview: its first round. */
  interview: InterviewPayload | null;
  today: string;
}

export interface InterviewQuestion {
  id: number;
  question: string;
  answer: string | null;
  reviewNotes: string | null;
  lastPractisedOn: string | null;
  jobApplicationId: number | null;
  applicationTitle: string | null;
  tags: Tag[];
}

export interface InterviewQuestionPayload {
  question: string;
  answer: string | null;
  reviewNotes: string | null;
  jobApplicationId: number | null;
  tagIds: number[];
}

/**
 * The Career API: roles (with promotions), salary history, professional achievements, job applications with their
 * interview rounds, and the interview question bank.
 */
@Injectable({ providedIn: 'root' })
export class CareerService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Career';

  // ---- Roles ----

  employments(): Observable<Employment[]> {
    return this.http
      .get<ApiResponse<Employment[]>>(`${this.base}/Employments`)
      .pipe(map((response) => response.data ?? []));
  }

  employment(id: number): Observable<Employment> {
    return this.http
      .get<ApiResponse<Employment>>(`${this.base}/Employments/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveEmployment(id: number | null, payload: EmploymentPayload): Observable<Employment> {
    const request = id
      ? this.http.put<ApiResponse<Employment>>(`${this.base}/Employments/${id}`, payload)
      : this.http.post<ApiResponse<Employment>>(`${this.base}/Employments`, payload);
    return request.pipe(map((response) => response.data!));
  }

  promote(id: number, payload: PromotionPayload): Observable<PromotionResult> {
    return this.http
      .post<ApiResponse<PromotionResult>>(`${this.base}/Employments/${id}/promotion`, payload)
      .pipe(map((response) => response.data!));
  }

  removeEmployment(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Employments/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  // ---- Salary ----

  salaryRecords(): Observable<SalaryRecord[]> {
    return this.http
      .get<ApiResponse<SalaryRecord[]>>(`${this.base}/SalaryRecords`)
      .pipe(map((response) => response.data ?? []));
  }

  saveSalaryRecord(id: number | null, payload: SalaryRecordPayload): Observable<SalaryRecord> {
    const request = id
      ? this.http.put<ApiResponse<SalaryRecord>>(`${this.base}/SalaryRecords/${id}`, payload)
      : this.http.post<ApiResponse<SalaryRecord>>(`${this.base}/SalaryRecords`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeSalaryRecord(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/SalaryRecords/${id}`)
      .pipe(map(() => undefined));
  }

  // ---- Achievements ----

  achievements(): Observable<CareerAchievement[]> {
    return this.http
      .get<ApiResponse<CareerAchievement[]>>(`${this.base}/CareerAchievements`)
      .pipe(map((response) => response.data ?? []));
  }

  achievement(id: number): Observable<CareerAchievement> {
    return this.http
      .get<ApiResponse<CareerAchievement>>(`${this.base}/CareerAchievements/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveAchievement(
    id: number | null,
    payload: CareerAchievementPayload,
  ): Observable<CareerAchievement> {
    const request = id
      ? this.http.put<ApiResponse<CareerAchievement>>(
          `${this.base}/CareerAchievements/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<CareerAchievement>>(`${this.base}/CareerAchievements`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeAchievement(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/CareerAchievements/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  // ---- Applications ----

  applications(): Observable<JobApplication[]> {
    return this.http
      .get<ApiResponse<JobApplication[]>>(`${this.base}/JobApplications`)
      .pipe(map((response) => response.data ?? []));
  }

  application(id: number): Observable<JobApplicationDetail> {
    return this.http
      .get<ApiResponse<JobApplicationDetail>>(`${this.base}/JobApplications/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveApplication(
    id: number | null,
    payload: JobApplicationPayload,
  ): Observable<JobApplicationDetail> {
    const request = id
      ? this.http.put<ApiResponse<JobApplicationDetail>>(
          `${this.base}/JobApplications/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<JobApplicationDetail>>(`${this.base}/JobApplications`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Moves it to another stage (logged); a move to Interview can schedule its first round. */
  moveApplication(id: number, payload: StageMovePayload): Observable<JobApplicationDetail> {
    return this.http
      .put<ApiResponse<JobApplicationDetail>>(`${this.base}/JobApplications/${id}/stage`, payload)
      .pipe(map((response) => response.data!));
  }

  removeApplication(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/JobApplications/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  // ---- Interview rounds ----

  saveInterview(
    id: number | null,
    applicationId: number,
    payload: InterviewPayload,
  ): Observable<Interview> {
    const request = id
      ? this.http.put<ApiResponse<Interview>>(
          `${this.base}/JobApplications/interviews/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<Interview>>(
          `${this.base}/JobApplications/${applicationId}/interviews`,
          payload,
        );
    return request.pipe(map((response) => response.data!));
  }

  /** Its calendar entry goes too (and that entry's reminders). */
  removeInterview(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/JobApplications/interviews/${id}`)
      .pipe(
        map(() => undefined),
        tap(() => this.remindersService.notifyChanged()),
      );
  }

  // ---- Question bank ----

  questions(
    filter: { tagId?: number; applicationId?: number } = {},
  ): Observable<InterviewQuestion[]> {
    let params = new HttpParams();
    if (filter.tagId) {
      params = params.set('tagId', filter.tagId);
    }
    if (filter.applicationId) {
      params = params.set('applicationId', filter.applicationId);
    }
    return this.http
      .get<ApiResponse<InterviewQuestion[]>>(`${this.base}/InterviewQuestions`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  question(id: number): Observable<InterviewQuestion> {
    return this.http
      .get<ApiResponse<InterviewQuestion>>(`${this.base}/InterviewQuestions/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveQuestion(
    id: number | null,
    payload: InterviewQuestionPayload,
  ): Observable<InterviewQuestion> {
    const request = id
      ? this.http.put<ApiResponse<InterviewQuestion>>(
          `${this.base}/InterviewQuestions/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<InterviewQuestion>>(`${this.base}/InterviewQuestions`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** "I went over it today." */
  practised(id: number, today: string): Observable<InterviewQuestion> {
    return this.http
      .put<ApiResponse<InterviewQuestion>>(`${this.base}/InterviewQuestions/${id}/practised`, {
        today,
      })
      .pipe(map((response) => response.data!));
  }

  removeQuestion(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/InterviewQuestions/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
