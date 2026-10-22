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

/** Mirrors TaskOutcomes on the API — one per task, first match wins. */
export type TaskOutcome = 'OnTime' | 'Late' | 'NoDueDate' | 'Overdue';

export interface ProductivityReport {
  from: string;
  to: string;
  tasks: {
    completed: number;
    onTime: number;
    late: number;
    noDueDate: number;
    created: number;
    duePassed: number;
    doneByDue: number;
    overdue: number;
    overdueRate: number | null;
  };
  estimates: {
    tasks: number;
    estimateMinutes: number;
    actualMinutes: number;
    over: number;
    withinEstimate: number;
    actualPercent: number | null;
  };
  focus: { minutes: number; sessions: number; days: number };
  weeks: ProductivityWeek[];
  areas: TimeByArea[];
  taskItems: TaskReportItem[];
}

export interface ProductivityWeek {
  weekStart: string;
  from: string;
  to: string;
  tasksDone: number;
  focusMinutes: number;
}

export interface TimeByArea {
  lifeAreaId: number | null;
  lifeAreaName: string;
  plannedMinutes: number;
  focusMinutes: number;
  studyMinutes: number;
  practiceMinutes: number;
  trackedMinutes: number;
}

export interface TaskReportItem {
  id: number;
  title: string;
  projectName: string | null;
  lifeAreaName: string | null;
  outcome: TaskOutcome;
  dueDate: string | null;
  completedOn: string | null;
  daysLate: number | null;
  estimateMinutes: number | null;
  actualMinutes: number;
}

export type LearningReachedKind =
  'CourseCompleted' | 'BookFinished' | 'SkillLevelUp' | 'Certification';

export interface LearningReport {
  from: string;
  to: string;
  totalMinutes: number;
  sessions: number;
  activeDays: number;
  subjects: LearningSubject[];
  weeks: LearningWeek[];
  reached: LearningReached[];
  coursesCompleted: number;
  booksFinished: number;
  levelUps: number;
  certifications: number;
}

export interface LearningWeek {
  weekStart: string;
  from: string;
  to: string;
  minutes: number;
}

export interface LearningSubject {
  kind: 'Skill' | 'Course' | 'MediaItem' | 'Topic';
  id: number | null;
  name: string;
  minutes: number;
  percent: number | null;
}

export interface LearningReached {
  kind: LearningReachedKind;
  id: number;
  title: string;
  day: string;
  detail: string | null;
}

export interface HealthReport {
  from: string;
  to: string;
  workouts: {
    sessions: number;
    minutes: number;
    activeDays: number;
    steps: number | null;
    distanceKm: number | null;
    kinds: WorkoutKindReport[];
  };
  sleep: { nights: number; averageMinutes: number | null; averageQuality: number | null };
  wellbeing: {
    checkIns: number;
    averageStress: number | null;
    averageEnergy: number | null;
    moodDays: number;
    averageMood: number | null;
  };
  body: BodyReport[];
  weeks: HealthReportWeek[];
}

export interface WorkoutKindReport {
  kind: string;
  sessions: number;
  minutes: number;
  distanceKm: number | null;
}

export interface BodyReport {
  kind: string;
  unit: string;
  readings: number;
  firstOn: string;
  first: number;
  first2: number | null;
  lastOn: string;
  last: number;
  last2: number | null;
  change: number;
  change2: number | null;
  points: { day: string; value: number; value2: number | null }[];
}

export interface HealthReportWeek {
  weekStart: string;
  from: string;
  to: string;
  workoutMinutes: number;
  sleepNights: number;
  sleepAverageMinutes: number | null;
  averageStress: number | null;
  averageEnergy: number | null;
  averageMood: number | null;
}

/** A report's query: the range plus the client's today and IANA zone (moments go on the user's local days). */
export function reportParams(range: ReportRange): HttpParams {
  return new HttpParams()
    .set('from', range.from)
    .set('to', range.to)
    .set('today', todayIso())
    .set('tz', browserTimeZone());
}

/** Reports (Sessions 90–91): every figure is computed by the API for the range asked, never stored. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Reports';

  goals(range: ReportRange): Observable<GoalReport> {
    return this.http
      .get<ApiResponse<GoalReport>>(`${this.baseUrl}/Goals`, { params: reportParams(range) })
      .pipe(map((res) => res.data!));
  }

  habits(range: ReportRange): Observable<HabitReport> {
    return this.http
      .get<ApiResponse<HabitReport>>(`${this.baseUrl}/Habits`, { params: reportParams(range) })
      .pipe(map((res) => res.data!));
  }

  productivity(range: ReportRange): Observable<ProductivityReport> {
    return this.http
      .get<ApiResponse<ProductivityReport>>(`${this.baseUrl}/Productivity`, {
        params: reportParams(range),
      })
      .pipe(map((res) => res.data!));
  }

  learning(range: ReportRange): Observable<LearningReport> {
    return this.http
      .get<ApiResponse<LearningReport>>(`${this.baseUrl}/Learning`, { params: reportParams(range) })
      .pipe(map((res) => res.data!));
  }

  // The health report needs the vault unlock, so it goes through HealthService.report().
}
