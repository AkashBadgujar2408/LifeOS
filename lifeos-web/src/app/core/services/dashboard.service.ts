import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { addDaysIso, localMidnight } from '../dates/today';
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
  streak: HabitStreak;
}

export interface MyDayJournalEntry {
  id: number;
  entryDate: string;
  title: string | null;
  excerpt: string | null;
  mood: Mood | null;
}

/** Mirrors MyDayDto: everything the My Day screen shows, as of the user's local `today`. */
export interface MyDay {
  today: string;
  tasks: MyDayTask[];
  events: MyDayEvent[];
  reminders: MyDayReminder[];
  goals: MyDayGoal[];
  habits: MyDayHabit[];
  latestJournalEntry: MyDayJournalEntry | null;
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
}
