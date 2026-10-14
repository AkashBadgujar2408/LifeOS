import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { ApiResponse } from './api-response';

/** What an entity is linked to, seen from that entity's side. */
export interface LinkedItem {
  linkId: number;
  entityType: string;
  entityId: number;
  title: string;
}

export interface LinkableItem {
  entityType: string;
  entityId: number;
  title: string;
}

export interface LinkableType {
  entityType: string;
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class EntityLinksService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/EntityLinks';

  // The set of linkable types only changes when the API is redeployed, so fetch it once per app load.
  private readonly types$ = this.http
    .get<ApiResponse<LinkableType[]>>(`${this.baseUrl}/types`)
    .pipe(
      map((response) => response.data ?? []),
      shareReplay(1),
    );

  types(): Observable<LinkableType[]> {
    return this.types$;
  }

  list(entityType: string, entityId: number): Observable<LinkedItem[]> {
    const params = new HttpParams().set('entityType', entityType).set('entityId', entityId);
    return this.http
      .get<ApiResponse<LinkedItem[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  searchCandidates(
    entityType: string,
    search: string,
    exclude: { entityType: string; entityId: number },
  ): Observable<LinkableItem[]> {
    const params = new HttpParams()
      .set('entityType', entityType)
      .set('search', search)
      .set('excludeEntityType', exclude.entityType)
      .set('excludeEntityId', exclude.entityId);
    return this.http
      .get<ApiResponse<LinkableItem[]>>(`${this.baseUrl}/candidates`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  create(
    source: { entityType: string; entityId: number },
    target: { entityType: string; entityId: number },
  ): Observable<LinkedItem> {
    return this.http
      .post<ApiResponse<LinkedItem>>(this.baseUrl, {
        sourceEntityType: source.entityType,
        sourceEntityId: source.entityId,
        targetEntityType: target.entityType,
        targetEntityId: target.entityId,
      })
      .pipe(map((response) => response.data!));
  }

  remove(linkId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${linkId}`)
      .pipe(map(() => undefined));
  }
}
