import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import { Mood } from './journal.service';

/** Matches MissionKinds on the API: derived from the goal type (long-term / short-term / bucket list). */
export type MissionKind = 'Main' | 'Side' | 'Collectible';

export interface Chapter {
  id: number;
  title: string;
  summary: string | null;
  /** "yyyy-MM-dd". */
  startDate: string;
  /** "yyyy-MM-dd"; null = the chapter you're in now. */
  endDate: string | null;
  isCurrent: boolean;
}

export interface ChapterPayload {
  title: string;
  summary: string | null;
  startDate: string;
  endDate: string | null;
}

export interface ChapterSaveResult {
  chapter: Chapter;
  /** The previous current chapter, when starting this one closed it. */
  closedChapter: Chapter | null;
}

export type StoryBeatKind =
  | 'GoalStarted'
  | 'MissionPassed'
  | 'GoalPostponed'
  | 'GoalAbandoned'
  | 'GoalResumed'
  | 'GoalRescheduled'
  | 'MilestoneDone'
  | 'HabitStarted'
  | 'JournalHighlight';

/** One thing that happened, on the user's local day (the API used their timezone). */
export interface StoryBeat {
  kind: StoryBeatKind;
  day: string;
  at: string | null;
  title: string | null;
  /** Debrief "How it went", or the journal excerpt. */
  detail: string | null;
  note: string | null;
  /** Debrief "What I'd tell my past self". */
  advice: string | null;
  missionKind: MissionKind | null;
  lifeAreaName: string | null;
  mood: Mood | null;
  fromDate: string | null;
  toDate: string | null;
  entityType: 'Goal' | 'Habit' | 'JournalEntry' | null;
  entityId: number | null;
  parentTitle: string | null;
}

/** A chapter with what happened in it, or (chapter null) a stretch no chapter covers. */
export interface StorySection {
  chapter: Chapter | null;
  from: string | null;
  to: string | null;
  beats: StoryBeat[];
}

export interface LifeStory {
  /** Oldest first, like a book. */
  sections: StorySection[];
  missionsPassed: number;
  milestonesDone: number;
  chapterCount: number;
}

export type GoalStatus = 'Active' | 'Completed' | 'Postponed' | 'Abandoned';

/** Another mission, as a prerequisite list needs it. */
export interface MissionRef {
  id: number;
  title: string;
  status: GoalStatus;
  kind: MissionKind;
}

export interface MissionObjective {
  id: number;
  title: string;
  done: boolean;
  targetDate: string | null;
}

/** A goal seen as a mission. Locks are advisory: shown, never enforced. */
export interface Mission {
  id: number;
  title: string;
  kind: MissionKind;
  status: GoalStatus;
  lifeAreaName: string;
  targetDate: string | null;
  createdAt: string;
  completedAt: string | null;
  progressPercent: number;
  objectives: MissionObjective[];
  prerequisites: MissionRef[];
  /** Prerequisites still in play (Active/Postponed); empty = unlocked. */
  blockedBy: MissionRef[];
  unlocks: MissionRef[];
  isLocked: boolean;
  hasDebrief: boolean;
}

export interface MissionDebrief {
  goalId: number;
  howItWent: string | null;
  adviceToPastSelf: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MissionPassed {
  mission: Mission;
  /** Missions that were waiting on this one and are now free. */
  nowUnlocked: MissionRef[];
  debrief: MissionDebrief | null;
}

/** The browser's IANA timezone ("Asia/Kolkata"), so the API puts recorded moments on the right local day. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

@Injectable({ providedIn: 'root' })
export class StoryService {
  private readonly http = inject(HttpClient);
  private readonly chaptersUrl = '/api/Story/Chapters';
  private readonly missionsUrl = '/api/Story/Missions';

  lifeStory(): Observable<LifeStory> {
    const params = new HttpParams().set('tz', browserTimeZone());
    return this.http
      .get<ApiResponse<LifeStory>>('/api/Story/LifeStory', { params })
      .pipe(map((response) => response.data!));
  }

  chapters(): Observable<Chapter[]> {
    return this.http
      .get<ApiResponse<Chapter[]>>(this.chaptersUrl)
      .pipe(map((response) => response.data ?? []));
  }

  createChapter(payload: ChapterPayload): Observable<ChapterSaveResult> {
    return this.http
      .post<ApiResponse<ChapterSaveResult>>(this.chaptersUrl, payload)
      .pipe(map((response) => response.data!));
  }

  updateChapter(id: number, payload: ChapterPayload): Observable<ChapterSaveResult> {
    return this.http
      .put<ApiResponse<ChapterSaveResult>>(`${this.chaptersUrl}/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  deleteChapter(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.chaptersUrl}/${id}`)
      .pipe(map(() => undefined));
  }

  missions(): Observable<Mission[]> {
    return this.http
      .get<ApiResponse<Mission[]>>(this.missionsUrl)
      .pipe(map((response) => response.data ?? []));
  }

  mission(goalId: number): Observable<Mission> {
    return this.http
      .get<ApiResponse<Mission>>(`${this.missionsUrl}/${goalId}`)
      .pipe(map((response) => response.data!));
  }

  addPrerequisite(goalId: number, requiresGoalId: number): Observable<Mission> {
    return this.http
      .post<ApiResponse<Mission>>(`${this.missionsUrl}/${goalId}/prerequisites`, { requiresGoalId })
      .pipe(map((response) => response.data!));
  }

  removePrerequisite(goalId: number, requiresGoalId: number): Observable<Mission> {
    return this.http
      .delete<ApiResponse<Mission>>(`${this.missionsUrl}/${goalId}/prerequisites/${requiresGoalId}`)
      .pipe(map((response) => response.data!));
  }

  /** The "Mission passed" screen for a completed goal. */
  passed(goalId: number): Observable<MissionPassed> {
    return this.http
      .get<ApiResponse<MissionPassed>>(`${this.missionsUrl}/${goalId}/passed`)
      .pipe(map((response) => response.data!));
  }

  /** Both prompts blank removes the debrief (resolves null). */
  saveDebrief(
    goalId: number,
    debrief: { howItWent: string | null; adviceToPastSelf: string | null },
  ): Observable<MissionDebrief | null> {
    return this.http
      .put<ApiResponse<MissionDebrief | null>>(`${this.missionsUrl}/${goalId}/debrief`, debrief)
      .pipe(map((response) => response.data));
  }
}
