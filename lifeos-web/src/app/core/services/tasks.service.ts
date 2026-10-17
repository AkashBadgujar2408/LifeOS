import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

export const TASK_PRIORITIES = ['None', 'Low', 'Medium', 'High'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RECURRENCE_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Yearly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** Matches TaskLinkableProvider.Type on the API. */
export const TASK_ENTITY_TYPE = 'Task';

export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
}

export interface TaskItem {
  id: number;
  title: string;
  notes: string | null;
  /** Calendar date "yyyy-MM-dd"; null = Someday. Never pass it through `new Date()`. */
  dueDate: string | null;
  priority: TaskPriority;
  status: 'Open' | 'Done';
  completedAt: string | null;
  projectId: number | null;
  projectName: string | null;
  recurrence: TaskRecurrence | null;
  tags: Tag[];
  /** How long it should take; null when not estimated. */
  estimateMinutes: number | null;
  /** Focus time logged (the sum of its focus sessions). */
  actualMinutes: number;
  /** Tasks it waits for, open ones first; it's blocked while any is open. */
  blockedBy: TaskRef[];
  createdAt: string;
}

/** Another task, as a dependency names it. */
export interface TaskRef {
  id: number;
  title: string;
  status: 'Open' | 'Done';
}

/** Time spent on a task with the focus timer (UTC instants). */
export interface FocusSession {
  id: number;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

export interface TaskPayload {
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  projectId: number | null;
  recurrence: TaskRecurrence | null;
  tagIds: number[];
  estimateMinutes: number | null;
  /** Replaces what it waits for; loops are refused. */
  blockedByTaskIds: number[];
}

export interface SetTaskCompletedResult {
  task: TaskItem;
  /** The next instance of a repeating task, when completing it created one. */
  nextOccurrence: TaskItem | null;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly baseUrl = '/api/Tasks/Tasks';

  // Bumped on any change made outside the Tasks page (e.g. an Inbox item turned into a task) so it can refresh.
  private readonly changedVersionSignal = signal(0);
  readonly changedVersion = this.changedVersionSignal.asReadonly();

  /** Open tasks, or the latest 100 done; optionally only one project's. */
  list(status: 'Open' | 'Done', projectId?: number): Observable<TaskItem[]> {
    let params = new HttpParams().set('status', status);
    if (projectId !== undefined) {
      params = params.set('projectId', projectId);
    }
    return this.http
      .get<ApiResponse<TaskItem[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<TaskItem> {
    return this.http
      .get<ApiResponse<TaskItem>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  create(payload: TaskPayload): Observable<TaskItem> {
    return this.http
      .post<ApiResponse<TaskItem>>(this.baseUrl, payload)
      .pipe(map((response) => response.data!));
  }

  /** Turns an Inbox item into a real task; the API carries over its links and marks it processed. */
  createFromInbox(inboxItemId: number, payload: TaskPayload): Observable<TaskItem> {
    return this.http
      .post<ApiResponse<TaskItem>>(`${this.baseUrl}/from-inbox/${inboxItemId}`, payload)
      .pipe(
        map((response) => response.data!),
        tap(() => this.changedVersionSignal.update((v) => v + 1)),
      );
  }

  update(id: number, payload: TaskPayload): Observable<TaskItem> {
    return this.http
      .put<ApiResponse<TaskItem>>(`${this.baseUrl}/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  /** `today` is the user's local date: it decides where a repeating task's next occurrence lands. */
  setCompleted(id: number, completed: boolean, today: string): Observable<SetTaskCompletedResult> {
    return this.http
      .put<ApiResponse<SetTaskCompletedResult>>(`${this.baseUrl}/${id}/completed`, {
        completed,
        today,
      })
      .pipe(map((response) => response.data!));
  }

  focusSessions(id: number): Observable<FocusSession[]> {
    return this.http
      .get<ApiResponse<FocusSession[]>>(`${this.baseUrl}/${id}/focus`)
      .pipe(map((response) => response.data ?? []));
  }

  /** Logs a focus session (UTC instants, focused minutes); returns the task with its new actual time. */
  addFocusSession(
    id: number,
    session: { startedAt: string; endedAt: string; minutes: number },
  ): Observable<TaskItem> {
    return this.http
      .post<ApiResponse<TaskItem>>(`${this.baseUrl}/${id}/focus`, session)
      .pipe(map((response) => response.data!));
  }

  removeFocusSession(id: number, sessionId: number): Observable<TaskItem> {
    return this.http
      .delete<ApiResponse<TaskItem>>(`${this.baseUrl}/${id}/focus/${sessionId}`)
      .pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
