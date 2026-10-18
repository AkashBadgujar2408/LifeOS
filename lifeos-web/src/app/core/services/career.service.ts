import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

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

/** The Career API: roles (with promotions), salary history and professional achievements. */
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
}
