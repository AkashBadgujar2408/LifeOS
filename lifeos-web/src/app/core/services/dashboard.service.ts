import type { DocumentKind } from './documents.service';
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { addDaysIso, browserTimeZone, localMidnight } from '../dates/today';
import type { ModuleKey } from './settings.service';
import { ApiResponse } from './api-response';
import { HabitStreak } from './habits.service';
import { Mood } from './journal.service';
import { ReminderTargetType } from './reminders.service';
import { TaskPriority } from './tasks.service';

export interface MyDayTask {
  id: number;
  title: string;
  /** "yyyy-MM-dd": today or earlier (overdue). */
  dueDate: string;
  priority: TaskPriority;
  isDone: boolean;
  isRecurring: boolean;
  projectId: number | null;
  projectName: string | null;
}

export interface MyDayEvent {
  id: number;
  title: string;
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  /** UTC instants ("…Z") for timed events. */
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  /** Today's occurrence of a recurring series (id is the series). */
  isRecurring: boolean;
  occurrenceDate: string | null;
}

export interface MyDayReminder {
  id: number;
  title: string;
  remindAt: string;
  entityType: ReminderTargetType | null;
  entityId: number | null;
}

export interface MyDayGoal {
  id: number;
  title: string;
  goalType: string;
  targetDate: string | null;
  lifeAreaName: string;
  milestoneCount: number;
  completedMilestoneCount: number;
  /** Worked out by the API (GoalProgress), never in the browser. */
  progressPercent: number;
  nextMilestoneId: number | null;
  nextMilestoneTitle: string | null;
  nextMilestoneTargetDate: string | null;
  lastActivityAt: string;
}

export interface MyDayHabit {
  id: number;
  title: string;
  scheduleDays: number;
  startDate: string;
  lifeAreaName: string | null;
  /** Measurable habits: ticking from My Day logs exactly this. */
  targetValue: number | null;
  unit: string | null;
  streak: HabitStreak;
}

export interface MyDayJournalEntry {
  id: number;
  entryDate: string;
  title: string | null;
  excerpt: string | null;
  mood: Mood | null;
}

export type InsightKind =
  | 'HabitStreakBroken'
  | 'GoalUntouched'
  | 'JournalGap'
  | 'OverdueTasks'
  | 'HabitStreakMilestone'
  | 'DocumentExpiring'
  | 'OverBudget';

/** A rule-based observation (DashboardInsights on the API). Nudge = something slipping; Cheer = good news. */
export interface Insight {
  kind: InsightKind;
  /** The situation it's about; dismissing hides it until this changes. */
  key: string;
  tone: 'Nudge' | 'Cheer';
  message: string;
  /** Where to act on it: Habit/Goal with an id, or a whole page (Journal, Tasks). */
  entityType: 'Habit' | 'Goal' | 'Journal' | 'Tasks' | 'Document' | 'Budgets' | null;
  entityId: number | null;
}

export interface LifeBalanceArea {
  lifeAreaId: number;
  lifeAreaName: string;
  activeGoals: number;
  goalsCompleted: number;
  milestonesCompleted: number;
  habitTicks: number;
  journalEntries: number;
  points: number;
  /** 0-10, relative to the busiest area in the window (worked out by the API). */
  score: number;
}

export interface LifeBalance {
  from: string;
  to: string;
  /** Every life area, in the taxonomy order. */
  areas: LifeBalanceArea[];
}

/** Mirrors MyDayDto: everything the My Day screen shows, as of the user's local `today`. */
export interface MyDayDocument {
  id: number;
  title: string;
  kind: DocumentKind;
  expiresOn: string;
}

export interface MyDay {
  today: string;
  tasks: MyDayTask[];
  events: MyDayEvent[];
  reminders: MyDayReminder[];
  goals: MyDayGoal[];
  habits: MyDayHabit[];
  latestJournalEntry: MyDayJournalEntry | null;
  /** Expiring within 60 days or expired in the last 30, soonest first. */
  expiringDocuments: MyDayDocument[];
  /** Nudges first, then good news — without the ones dismissed. */
  insights: Insight[];
  /** Today's insights the user dismissed (back once their situation changes, or on "Show"). */
  hiddenInsightCount: number;
}

export type KpiUnit = 'Count' | 'Percent' | 'Minutes';

/** A figure that can go on My Day (KpiFigures.All on the API); its module hides it with the module. */
export interface KpiDefinition {
  key: string;
  label: string;
  module: ModuleKey;
  unit: KpiUnit;
  comparedWith: string | null;
}

/** A chosen tile, worked out by the API for today. */
export interface KpiTile extends KpiDefinition {
  /** Null when there's nothing to measure yet. */
  value: number | null;
  previous: number | null;
}

export interface Kpis {
  tiles: KpiTile[];
  available: KpiDefinition[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  /**
   * One call for the whole screen. `today` is the user's local date; the day's local midnights go along as UTC
   * instants so timed events land on the right day (the server doesn't know the timezone).
   */
  getMyDay(today: string): Observable<MyDay> {
    const params = new HttpParams()
      .set('today', today)
      .set('dayStartUtc', localMidnight(today).toISOString())
      .set('dayEndUtc', localMidnight(addDaysIso(today, 1)).toISOString());
    return this.http
      .get<ApiResponse<MyDay>>('/api/Dashboard/MyDay', { params })
      .pipe(map((response) => response.data!));
  }

  /** The chosen KPI tiles + the catalogue; the windows' local midnights follow the browser's zone. */
  getKpis(today: string): Observable<Kpis> {
    const params = new HttpParams().set('today', today).set('tz', browserTimeZone());
    return this.http
      .get<ApiResponse<Kpis>>('/api/Dashboard/Kpis', { params })
      .pipe(map((response) => response.data!));
  }

  /** Replaces the chosen tiles, in this order (at most 6). */
  saveKpis(keys: string[]): Observable<string[]> {
    return this.http
      .put<ApiResponse<string[]>>('/api/Dashboard/Kpis', { keys })
      .pipe(map((response) => response.data ?? []));
  }

  /** Hides an insight until its situation changes. */
  dismissInsight(key: string): Observable<void> {
    return this.http
      .post<ApiResponse<boolean>>('/api/Dashboard/Insights/dismissed', { key })
      .pipe(map(() => undefined));
  }

  /** Brings back every dismissed insight. */
  restoreInsights(): Observable<void> {
    return this.http
      .delete<ApiResponse<number>>('/api/Dashboard/Insights/dismissed')
      .pipe(map(() => undefined));
  }

  /** Activity per life area over local days `from`..`to` (inclusive); the span goes along as UTC instants too. */
  getLifeBalance(from: string, to: string): Observable<LifeBalance> {
    const params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('fromUtc', localMidnight(from).toISOString())
      .set('toUtc', localMidnight(addDaysIso(to, 1)).toISOString());
    return this.http
      .get<ApiResponse<LifeBalance>>('/api/Dashboard/LifeBalance', { params })
      .pipe(map((response) => response.data!));
  }
}
