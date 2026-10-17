import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';

export interface SearchResult {
  entityType: string;
  entityId: number;
  title: string;
  /** Journal entries: the words around the match in the entry's text. */
  snippet: string | null;
}

/** One kind of item's matches (at most five; hasMore when there were more). */
export interface SearchGroup {
  entityType: string;
  displayName: string;
  items: SearchResult[];
  hasMore: boolean;
}

/** The API ignores shorter queries. */
export const SEARCH_MIN_LENGTH = 2;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<SearchGroup[]> {
    const params = new HttpParams({ fromObject: { q: query } });
    return this.http
      .get<ApiResponse<SearchGroup[]>>('/api/Shared/Search', { params })
      .pipe(map((response) => response.data ?? []));
  }
}
