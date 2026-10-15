import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';

export const PROJECT_STATUSES = ['Active', 'Completed', 'Archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Matches ProjectLinkableProvider.Type on the API. */
export const PROJECT_ENTITY_TYPE = 'Project';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  openTaskCount: number;
  doneTaskCount: number;
  /** Earliest due date among the open tasks, "yyyy-MM-dd". */
  nextDueDate: string | null;
  createdAt: string;
}

export interface ProjectPayload {
  name: string;
  description: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly baseUrl = '/api/Tasks/Projects';

  /** Every project, any status, sorted by name. */
  list(): Observable<Project[]> {
    return this.http
      .get<ApiResponse<Project[]>>(this.baseUrl)
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<Project> {
    return this.http
      .get<ApiResponse<Project>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  create(payload: ProjectPayload): Observable<Project> {
    return this.http
      .post<ApiResponse<Project>>(this.baseUrl, payload)
      .pipe(map((response) => response.data!));
  }

  update(id: number, payload: ProjectPayload): Observable<Project> {
    return this.http
      .put<ApiResponse<Project>>(`${this.baseUrl}/${id}`, payload)
      .pipe(map((response) => response.data!));
  }

  setStatus(id: number, status: ProjectStatus): Observable<Project> {
    return this.http
      .put<ApiResponse<Project>>(`${this.baseUrl}/${id}/status`, { status })
      .pipe(map((response) => response.data!));
  }

  /** Deletes the project; its tasks stay, without a project. */
  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      // Reminders about it are deleted with it.
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
