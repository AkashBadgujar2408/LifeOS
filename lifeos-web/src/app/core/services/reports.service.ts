import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { browserTimeZone, todayIso } from '../dates/today';
import { ApiResponse } from './api-response';

/** A report's range: local days, "yyyy-MM-dd", inclusive. */
export interface ReportRange {
  from: string;
  to: string;
}

/** Mirrors GoalOutcomes on the API — one per goal, first match wins. */
export type GoalOutcome = 'OnTime' | 'Late' | 'NoTarget' | 'Abandoned' | 'Missed' | 'InProgress';

export interface GoalReportCounts {
  completed: number;
  onTime: number;
  late: number;
  noTarget: number;
  abandoned: number;
  missed: number;
  inProgress: number;
  pushedBack: number;
  started: number;
  onTimePercent: number | null;
}

export interface GoalReportArea extends GoalReportCounts {
  lifeAreaId: number;
  lifeAreaName: string;
}

export interface GoalReportItem {
  id: number;
  title: string;
  goalType: string;
  status: string;
  lifeAreaId: number;
  lifeAreaName: string;
  outcome: GoalOutcome;
  targetDate: string | null;
  completedOn: string | null;
  abandonedOn: string | null;
  startedOn: string;
  daysLate: number | null;
  pushedBack: number;
}

export interface GoalReport {
  from: string;
  to: string;
  totals: GoalReportCounts;
  areas: GoalReportArea[];
  goals: GoalReportItem[];
}

export interface HabitShare {
  total: number;
  good: number;
  percent: number | null;
}

export interface HabitReportItem extends HabitShare {
  id: number;
  title: string;
  kind: 'Build' | 'Avoid';
  status: 'Active' | 'Archived';
  lifeAreaName: string | null;
  scheduleDays: number;
  slips: number;
  bestRun: number;
  archivedOn: string | null;
}

export interface HabitReportWeek extends HabitShare {
  weekStart: string;
  from: string;
  to: string;
}

export interface HabitReport {
  from: string;
  to: string;
  build: HabitShare;
  avoid: HabitShare;
  habits: HabitReportItem[];
  weeks: HabitReportWeek[];
}

/** Reports (Session 90): every figure is computed by the API for the range asked, never stored. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Reports';

  goals(range: ReportRange): Observable<GoalReport> {
    return this.http
      .get<ApiResponse<GoalReport>>(`${this.baseUrl}/Goals`, { params: this.params(range) })
      .pipe(map((res) => res.data!));
  }

  habits(range: ReportRange): Observable<HabitReport> {
    return this.http
      .get<ApiResponse<HabitReport>>(`${this.baseUrl}/Habits`, { params: this.params(range) })
      .pipe(map((res) => res.data!));
  }

  private params(range: ReportRange): HttpParams {
    return new HttpParams()
      .set('from', range.from)
      .set('to', range.to)
      .set('today', todayIso())
      .set('tz', browserTimeZone());
  }
}
