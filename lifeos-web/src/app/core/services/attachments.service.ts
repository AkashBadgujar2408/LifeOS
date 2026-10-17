import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';

export interface Attachment {
  id: number;
  entityType: string;
  entityId: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

/** Files on goals and tasks (api/Shared/Attachments); used by <app-attachments>. */
@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/Attachments';

  list(entityType: string, entityId: number): Observable<Attachment[]> {
    return this.http
      .get<ApiResponse<Attachment[]>>(this.baseUrl, { params: this.target(entityType, entityId) })
      .pipe(map((response) => response.data ?? []));
  }

  /** All or none; returns the item's attachments afterwards. */
  upload(entityType: string, entityId: number, files: readonly File[]): Observable<Attachment[]> {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return this.http
      .post<ApiResponse<Attachment[]>>(this.baseUrl, form, {
        params: this.target(entityType, entityId),
      })
      .pipe(map((response) => response.data ?? []));
  }

  remove(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`)
      .pipe(map(() => undefined));
  }

  /** The bytes as a Blob of the file's real type — `raw=true` for the same IDM reason as document files. */
  fileBlob(attachment: Pick<Attachment, 'id' | 'contentType'>): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}/${attachment.id}/file`, {
        params: new HttpParams().set('raw', true),
        responseType: 'blob',
      })
      .pipe(map((blob) => new Blob([blob], { type: attachment.contentType })));
  }

  private target(entityType: string, entityId: number): HttpParams {
    return new HttpParams().set('entityType', entityType).set('entityId', entityId);
  }
}
