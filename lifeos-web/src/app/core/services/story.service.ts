import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import type { ProgressKind } from './goals.service';
import { Mood } from './journal.service';
import { browserTimeZone } from '../dates/today';

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
  | 'JournalHighlight'
  | 'Memory'
  | 'AchievementUnlocked'
  | 'MediaFinished'
  | 'NewRole'
  | 'CareerPromotion'
  | 'CareerProject'
  | 'CareerAward'
  | 'CareerContribution'
  | 'CareerOther';

/** One thing that happened, on the user's local day (the API used their timezone). */
export interface StoryBeat {
  kind: StoryBeatKind;
  day: string;
  at: string | null;
  title: string | null;
  /** Debrief "How it went", the journal excerpt, or what earned an achievement. */
  detail: string | null;
  note: string | null;
  /** Debrief "What I'd tell my past self". */
  advice: string | null;
  missionKind: MissionKind | null;
  lifeAreaName: string | null;
  mood: Mood | null;
  fromDate: string | null;
  toDate: string | null;
  entityType:
    'Goal' | 'Habit' | 'JournalEntry' | 'Employment' | 'CareerAchievement' | 'MediaItem' | null;
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
  achievementsUnlocked: number;
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
  /** A Health target behind the vault: show "Locked", not the percent. */
  progressLocked: boolean;
  /** What the % is measured by: objectives, a number, money saved or a body target. */
  progressKind: ProgressKind;
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

/** A life area's all-time stats: everything finished in it, as XP and a level (computed by the API, never stored). */
export interface LifeAreaStats {
  lifeAreaId: number;
  lifeAreaName: string;
  goalsCompleted: number;
  milestonesCompleted: number;
  habitDays: number;
  journalEntries: number;
  /** Minutes studied in the area (10 XP per full hour). */
  studyMinutes: number;
  lastActivityOn: string | null;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

/** A month's self-rating of one life area, 1–10. */
export interface LifeAreaRating {
  lifeAreaId: number;
  /** The month's first day, "yyyy-MM-01". */
  month: string;
  rating: number;
  note: string | null;
}

/** One area's rating in a save; rating null clears it. */
export interface LifeAreaRatingInput {
  lifeAreaId: number;
  rating: number | null;
  note: string | null;
}

/** An achievement: computed from real data by the API, never stored. */
export interface Achievement {
  /** Stable identifier ("streak-7"). */
  key: string;
  title: string;
  description: string;
  /** A Bootstrap Icons class. */
  icon: string;
  progress: number;
  target: number;
  /** The local day it was earned; null while locked. */
  unlockedOn: string | null;
  unlocked: boolean;
}

/** The "Previously on…" card on My Day. */
export interface StoryRecap {
  chapter: Chapter | null;
  chapterNumber: number | null;
  /** Newest first. */
  recentBeats: StoryBeat[];
  currentMission: Mission | null;
}

@Injectable({ providedIn: 'root' })
export class StoryService {
  private readonly http = inject(HttpClient);
  private readonly chaptersUrl = '/api/Story/Chapters';
  private readonly missionsUrl = '/api/Story/Missions';
  private readonly lifeAreasUrl = '/api/Story/LifeAreas';

  lifeStory(): Observable<LifeStory> {
    const params = new HttpParams().set('tz', browserTimeZone());
    return this.http
      .get<ApiResponse<LifeStory>>('/api/Story/LifeStory', { params })
      .pipe(map((response) => response.data!));
  }

  recap(): Observable<StoryRecap> {
    const params = new HttpParams().set('tz', browserTimeZone());
    return this.http
      .get<ApiResponse<StoryRecap>>('/api/Story/LifeStory/recap', { params })
      .pipe(map((response) => response.data!));
  }

  achievements(): Observable<Achievement[]> {
    const params = new HttpParams().set('tz', browserTimeZone());
    return this.http
      .get<ApiResponse<Achievement[]>>('/api/Story/Achievements', { params })
      .pipe(map((response) => response.data ?? []));
  }

  lifeAreaStats(): Observable<LifeAreaStats[]> {
    return this.http
      .get<ApiResponse<LifeAreaStats[]>>(`${this.lifeAreasUrl}/stats`)
      .pipe(map((response) => response.data ?? []));
  }

  /** Ratings for the months `fromMonth`..`toMonth` (first days, inclusive). */
  ratings(fromMonth: string, toMonth: string): Observable<LifeAreaRating[]> {
    const params = new HttpParams().set('from', fromMonth).set('to', toMonth);
    return this.http
      .get<ApiResponse<LifeAreaRating[]>>(`${this.lifeAreasUrl}/ratings`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  /** Saves a month's ratings; resolves the month's ratings as stored. */
  saveRatings(
    month: string,
    today: string,
    ratings: LifeAreaRatingInput[],
  ): Observable<LifeAreaRating[]> {
    return this.http
      .put<ApiResponse<LifeAreaRating[]>>(`${this.lifeAreasUrl}/ratings/${month}`, {
        today,
        ratings,
      })
      .pipe(map((response) => response.data ?? []));
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
