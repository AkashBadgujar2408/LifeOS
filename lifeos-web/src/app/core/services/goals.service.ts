import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
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
}

export interface GoalPayload {
  title: string;
  description: string | null;
  lifeAreaId: number;
  goalType: GoalType;
  targetDate: string | null;
  tagIds: number[];
}

export interface MilestonePayload {
  title: string;
  targetDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class GoalsService {
  private readonly http = inject(HttpClient);
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

  remove(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`)
      .pipe(map(() => undefined));
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
}
