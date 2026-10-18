import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

export const GOAL_TYPES = ['ShortTerm', 'LongTerm', 'BucketList'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  ShortTerm: 'Short-term',
  LongTerm: 'Long-term',
  BucketList: 'Bucket list',
};

export const GOAL_STATUSES = ['Active', 'Completed', 'Postponed', 'Abandoned'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Matches GoalLinkableProvider.Type on the API. */
export const GOAL_ENTITY_TYPE = 'Goal';

export interface GoalSummary {
  id: number;
  title: string;
  lifeAreaId: number;
  lifeAreaName: string;
  goalType: GoalType;
  status: GoalStatus;
  /** Calendar date, "yyyy-MM-dd". No timezone: never pass it through `new Date()`. */
  targetDate: string | null;
  completedAt: string | null;
  milestoneCount: number;
  completedMilestoneCount: number;
  /** Calculated by the API (GoalProgress); not re-derived here. */
  progressPercent: number;
  nextMilestoneTitle: string | null;
  /** A savings goal's amount to reach (both or neither); progress comes from linked accounts/investments. */
  targetAmount: number | null;
  targetCurrency: string | null;
  tags: Tag[];
}

export interface GoalMilestone {
  id: number;
  goalId: number;
  title: string;
  targetDate: string | null;
  completedAt: string | null;
  sortOrder: number;
}

export interface GoalDetail extends GoalSummary {
  description: string | null;
  createdAt: string;
  milestones: GoalMilestone[];
  /** Newest first. */
  history: GoalHistoryEntry[];
}

/** A goal's review log: status changes and revisions (edits that changed something). */
export interface GoalHistoryEntry {
  id: number;
  eventType: 'StatusChanged' | 'Revised';
  fromStatus: GoalStatus | null;
  toStatus: GoalStatus | null;
  /** Revised only: GoalRequest property names, plus "Tags" and "LifeArea". */
  changedFields: string[];
  previousTargetDate: string | null;
  newTargetDate: string | null;
  note: string | null;
  createdAt: string;
}

export interface GoalPayload {
  title: string;
  description: string | null;
  lifeAreaId: number;
  goalType: GoalType;
  targetDate: string | null;
  tagIds: number[];
  /** Makes it a savings goal (both or neither). */
  targetAmount: number | null;
  targetCurrency: string | null;
  /** Edit only: why the goal is being revised (logged to its history). */
  revisionNote?: string | null;
}

export interface MilestonePayload {
  title: string;
  targetDate: string | null;
}

/** From this moment on (UTC, "…Z") the goal stood at this percent; the last point is "now". */
export interface GoalTrendPoint {
  at: string;
  percent: number;
}

interface LifeVision {
  text: string | null;
}

@Injectable({ providedIn: 'root' })
export class GoalsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly baseUrl = '/api/Goals/Goals';

  list(status?: GoalStatus): Observable<GoalSummary[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http
      .get<ApiResponse<GoalSummary[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<GoalDetail> {
    return this.http
      .get<ApiResponse<GoalDetail>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  create(payload: GoalPayload): Observable<GoalDetail> {
    return this.http
      .post<ApiResponse<GoalDetail>>(this.baseUrl, payload)
      .pipe(map((response) => response.data!));
  }

  update(id: number, payload: GoalPayload): Observable<GoalDetail> {
    return this.http
      .put<ApiResponse<GoalDetail>>(`${this.baseUrl}/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  setStatus(id: number, status: GoalStatus, note: string | null): Observable<GoalDetail> {
    return this.http
      .put<ApiResponse<GoalDetail>>(`${this.baseUrl}/${id}/status`, { status, note })
      .pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  addMilestone(goalId: number, payload: MilestonePayload): Observable<GoalMilestone> {
    return this.http
      .post<ApiResponse<GoalMilestone>>(`${this.baseUrl}/${goalId}/Milestones`, payload)
      .pipe(map((response) => response.data!));
  }

  updateMilestone(
    goalId: number,
    id: number,
    payload: MilestonePayload,
  ): Observable<GoalMilestone> {
    return this.http
      .put<ApiResponse<GoalMilestone>>(`${this.baseUrl}/${goalId}/Milestones/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  setMilestoneCompleted(goalId: number, id: number, completed: boolean): Observable<GoalMilestone> {
    return this.http
      .put<ApiResponse<GoalMilestone>>(`${this.baseUrl}/${goalId}/Milestones/${id}/completed`, {
        completed,
      })
      .pipe(map((response) => response.data!));
  }

  reorderMilestones(goalId: number, milestoneIds: number[]): Observable<void> {
    return this.http
      .put<ApiResponse<boolean>>(`${this.baseUrl}/${goalId}/Milestones/order`, { milestoneIds })
      .pipe(map(() => undefined));
  }

  removeMilestone(goalId: number, id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${goalId}/Milestones/${id}`)
      .pipe(map(() => undefined));
  }

  /** Progress % over time, oldest first (rebuilt by the API from milestone and status history). */
  trend(id: number): Observable<GoalTrendPoint[]> {
    return this.http
      .get<ApiResponse<GoalTrendPoint[]>>(`${this.baseUrl}/${id}/trend`)
      .pipe(map((response) => response.data ?? []));
  }

  getVision(): Observable<string | null> {
    return this.http
      .get<ApiResponse<LifeVision>>('/api/Goals/Vision')
      .pipe(map((response) => response.data?.text ?? null));
  }

  /** Blank clears it. */
  saveVision(text: string): Observable<string | null> {
    return this.http
      .put<ApiResponse<LifeVision>>('/api/Goals/Vision', { text })
      .pipe(map((response) => response.data?.text ?? null));
  }
}
