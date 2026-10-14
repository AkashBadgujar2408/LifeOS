import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';

export const INBOX_KINDS = ['Task', 'Note', 'Journal', 'Idea'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Matches InboxLinkableProvider.Type on the API. */
export const INBOX_ENTITY_TYPE = 'InboxItem';

export interface InboxItem {
  id: number;
  kind: InboxKind;
  title: string;
  notes: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface CreateInboxItemPayload {
  kind: InboxKind;
  title: string;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/Inbox';

  // Bumped on every capture so screens showing the inbox can refresh after a Quick Add from anywhere.
  private readonly capturedVersionSignal = signal(0);
  readonly capturedVersion = this.capturedVersionSignal.asReadonly();

  // Open (unprocessed) items per kind — feeds the sidebar badge and My Day. Refreshed after every change.
  private readonly openCountsSignal = signal<Record<InboxKind, number>>(emptyCounts());
  readonly openCounts = this.openCountsSignal.asReadonly();
  private readonly openCountsLoadedSignal = signal(false);
  /** False until the first count arrives, so screens don't flash "nothing waiting" before data loads. */
  readonly openCountsLoaded = this.openCountsLoadedSignal.asReadonly();
  readonly openTotal = computed(() =>
    Object.values(this.openCountsSignal()).reduce((sum, count) => sum + count, 0),
  );

  /** Called on logout so the next user never sees the previous user's counts. */
  resetOpenCounts(): void {
    this.openCountsSignal.set(emptyCounts());
    this.openCountsLoadedSignal.set(false);
  }

  refreshOpenCounts(): void {
    this.list(false).subscribe({
      next: (items) => {
        const counts = emptyCounts();
        for (const item of items) {
          counts[item.kind]++;
        }
        this.openCountsSignal.set(counts);
        this.openCountsLoadedSignal.set(true);
      },
      // Non-critical (a badge); the Inbox screen itself reports load failures.
      error: () => {
        this.openCountsSignal.set(emptyCounts());
        this.openCountsLoadedSignal.set(true);
      },
    });
  }

  list(includeProcessed: boolean): Observable<InboxItem[]> {
    const params = new HttpParams().set('includeProcessed', includeProcessed);
    return this.http
      .get<ApiResponse<InboxItem[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  create(payload: CreateInboxItemPayload): Observable<InboxItem> {
    return this.http.post<ApiResponse<InboxItem>>(this.baseUrl, payload).pipe(
      map((response) => response.data!),
      tap(() => {
        this.capturedVersionSignal.update((v) => v + 1);
        this.refreshOpenCounts();
      }),
    );
  }

  setProcessed(id: number, processed: boolean): Observable<InboxItem> {
    return this.http
      .put<ApiResponse<InboxItem>>(`${this.baseUrl}/${id}/processed`, { processed })
      .pipe(
        map((response) => response.data!),
        tap(() => this.refreshOpenCounts()),
      );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      tap(() => this.refreshOpenCounts()),
    );
  }
}

function emptyCounts(): Record<InboxKind, number> {
  return { Task: 0, Note: 0, Journal: 0, Idea: 0 };
}
