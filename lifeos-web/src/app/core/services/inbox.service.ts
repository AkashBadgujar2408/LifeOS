import { Injectable, inject, signal } from '@angular/core';
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

  list(includeProcessed: boolean): Observable<InboxItem[]> {
    const params = new HttpParams().set('includeProcessed', includeProcessed);
    return this.http
      .get<ApiResponse<InboxItem[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  create(payload: CreateInboxItemPayload): Observable<InboxItem> {
    return this.http.post<ApiResponse<InboxItem>>(this.baseUrl, payload).pipe(
      map((response) => response.data!),
      tap(() => this.capturedVersionSignal.update((v) => v + 1)),
    );
  }

  setProcessed(id: number, processed: boolean): Observable<InboxItem> {
    return this.http
      .put<ApiResponse<InboxItem>>(`${this.baseUrl}/${id}/processed`, { processed })
      .pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`)
      .pipe(map(() => undefined));
  }
}
