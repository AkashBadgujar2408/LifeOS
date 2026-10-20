import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { todayIso } from '../dates/today';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';
import { VaultService } from './vault.service';

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

/** Manual = a number I log; Linked = counted from other items (habits, study, …). */
export type MeasureSource = 'Manual' | 'Linked';

/** What a goal's progress % is measured by (GoalProgressKinds on the API). */
export type ProgressKind = 'Milestones' | 'Measure' | 'Savings' | 'Body';

/** One line of a measured goal's log. CarriedOver = what a source had counted when it stopped counting. */
export interface GoalMeasureEntry {
  id: number;
  goalId: number;
  /** Calendar date, "yyyy-MM-dd". */
  entryDate: string;
  value: number;
  kind: 'Logged' | 'CarriedOver';
  note: string | null;
  createdAt: string;
}

export interface GoalMeasureEntryPayload {
  entryDate: string;
  value: number;
  note: string | null;
}

/** goals.GoalSources.Kind on the API. */
export type GoalSourceKind =
  | 'Habit'
  | 'StudyTime'
  | 'BooksFinished'
  | 'CoursesCompleted'
  | 'Roadmap'
  | 'ProjectTasks'
  | 'ProjectFocus'
  | 'Workouts';

/** Something a counted goal is counted from, and what it has counted so far. */
export interface GoalSource {
  id: number;
  goalId: number;
  kind: GoalSourceKind;
  entityType: string | null;
  entityId: number | null;
  filter: string | null;
  metric: string | null;
  /** Nothing earlier counts. "yyyy-MM-dd". */
  countsFrom: string;
  title: string;
  unit: string;
  /** Null when it's Health data and the vault is locked. */
  counted: number | null;
  locked: boolean;
}

export interface GoalSourcePayload {
  kind: GoalSourceKind;
  entityType: string | null;
  entityId: number | null;
  filter?: string | null;
  metric?: string | null;
  countsFrom?: string | null;
}

/** Something a goal could be counted from (the API lists them per provider). */
export interface GoalSourceOption {
  kind: GoalSourceKind;
  entityType: string | null;
  entityId: number | null;
  filter: string | null;
  metric: string | null;
  title: string;
  /** What it counts in; a goal's unit must match. */
  unit: string;
}

/** A goal an item counts toward, for "Counts toward" on the item's page. */
export interface GoalCountedBy {
  goalId: number;
  goalTitle: string;
  status: GoalStatus;
  percent: number;
  locked: boolean;
  measureCurrent: number | null;
  measureTarget: number | null;
  measureUnit: string | null;
  counted: number | null;
}

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
  /** A measured goal: the number to reach in `measureUnit`, what was already done, and how it moves. */
  measureTarget: number | null;
  measureStart: number | null;
  measureUnit: string | null;
  measureSource: MeasureSource | null;
  /** Where a measured goal stands (already done + logged + counted); null when locked. */
  measureCurrent: number | null;
  /** What `progressPercent` is measured by. */
  progressKind: ProgressKind;
  /** Health data behind the vault: show "Locked", never the percent. */
  progressLocked: boolean;
  tags: Tag[];
}

export interface GoalMilestone {
  id: number;
  goalId: number;
  title: string;
  targetDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  /** The task or project it follows — it ticks itself when that's done (never by hand). */
  taskItemId: number | null;
  projectId: number | null;
  /** The followed task's title or project's name. */
  followsTitle: string | null;
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
  /** Makes it a measured goal: target, unit and source together, or all null. */
  measureTarget: number | null;
  measureStart: number | null;
  measureUnit: string | null;
  measureSource: MeasureSource | null;
  /** The client's today: a counted goal switched back to logging carries its total over on this day. */
  today: string;
  /** Edit only: why the goal is being revised (logged to its history). */
  revisionNote?: string | null;
}

export interface MilestonePayload {
  title: string;
  targetDate: string | null;
  /** Follow a task or a project (at most one); null for a milestone you tick yourself. */
  taskItemId: number | null;
  projectId: number | null;
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
  private readonly vault = inject(VaultService);
  private readonly baseUrl = '/api/Goals/Goals';

  /**
   * Reads carry the client's today (measures count up to it) and, when the vault is open, its unlock — so a Health
   * target's % shows; without it the API says "locked" instead. Never prompts for the vault.
   */
  list(status?: GoalStatus): Observable<GoalSummary[]> {
    let params = new HttpParams().set('today', todayIso());
    if (status) {
      params = params.set('status', status);
    }
    return this.http
      .get<ApiResponse<GoalSummary[]>>(this.baseUrl, { params, headers: this.vault.headers() })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<GoalDetail> {
    return this.http
      .get<ApiResponse<GoalDetail>>(`${this.baseUrl}/${id}`, {
        params: { today: todayIso() },
        headers: this.vault.headers(),
      })
      .pipe(map((response) => response.data!));
  }

  /** A measured goal's log, newest first. */
  entries(goalId: number): Observable<GoalMeasureEntry[]> {
    return this.http
      .get<ApiResponse<GoalMeasureEntry[]>>(`${this.baseUrl}/${goalId}/measure/entries`)
      .pipe(map((response) => response.data ?? []));
  }

  addEntry(goalId: number, payload: GoalMeasureEntryPayload): Observable<GoalMeasureEntry> {
    return this.http
      .post<ApiResponse<GoalMeasureEntry>>(`${this.baseUrl}/${goalId}/measure/entries`, {
        ...payload,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  updateEntry(
    goalId: number,
    id: number,
    payload: GoalMeasureEntryPayload,
  ): Observable<GoalMeasureEntry> {
    return this.http
      .put<ApiResponse<GoalMeasureEntry>>(`${this.baseUrl}/${goalId}/measure/entries/${id}`, {
        ...payload,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  removeEntry(goalId: number, id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${goalId}/measure/entries/${id}`)
      .pipe(map(() => undefined));
  }

  /** What a counted goal is counted from, with what each has counted so far. */
  sources(goalId: number): Observable<GoalSource[]> {
    return this.http
      .get<ApiResponse<GoalSource[]>>(`${this.baseUrl}/${goalId}/measure/sources`, {
        params: { today: todayIso() },
        headers: this.vault.headers(),
      })
      .pipe(map((response) => response.data ?? []));
  }

  addSource(goalId: number, payload: GoalSourcePayload): Observable<GoalSource> {
    return this.http
      .post<ApiResponse<GoalSource>>(
        `${this.baseUrl}/${goalId}/measure/sources`,
        { ...payload, today: todayIso() },
        { headers: this.vault.headers() },
      )
      .pipe(map((response) => response.data!));
  }

  updateSource(goalId: number, id: number, countsFrom: string): Observable<GoalSource> {
    return this.http
      .put<ApiResponse<GoalSource>>(
        `${this.baseUrl}/${goalId}/measure/sources/${id}`,
        { countsFrom, today: todayIso() },
        { headers: this.vault.headers() },
      )
      .pipe(map((response) => response.data!));
  }

  /** Stops counting from it; what it counted stays as a Carried over entry. */
  removeSource(goalId: number, id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${goalId}/measure/sources/${id}`, {
        params: { today: todayIso() },
        headers: this.vault.headers(),
      })
      .pipe(map(() => undefined));
  }

  /** Everything a goal could be counted from, each with the unit it counts in. */
  sourceOptions(): Observable<GoalSourceOption[]> {
    return this.http
      .get<ApiResponse<GoalSourceOption[]>>('/api/Goals/SourceOptions')
      .pipe(map((response) => response.data ?? []));
  }

  /** The goals an item (a habit, a skill, a project…) counts toward. */
  countsToward(entityType: string, entityId: number): Observable<GoalCountedBy[]> {
    return this.http
      .get<ApiResponse<GoalCountedBy[]>>('/api/Goals/CountsToward', {
        params: { entityType, entityId, today: todayIso() },
        headers: this.vault.headers(),
      })
      .pipe(map((response) => response.data ?? []));
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
      .get<ApiResponse<GoalTrendPoint[]>>(`${this.baseUrl}/${id}/trend`, {
        params: { today: todayIso() },
        headers: this.vault.headers(),
      })
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
