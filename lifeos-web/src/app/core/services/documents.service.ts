import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { VaultService } from './vault.service';

export const DOCUMENT_ENTITY_TYPE = 'Document';

export type DocumentKind =
  'Identity' | 'Education' | 'Employment' | 'Financial' | 'Legal' | 'Medical' | 'Other';

export const DOCUMENT_KINDS: DocumentKind[] = [
  'Identity',
  'Education',
  'Employment',
  'Financial',
  'Legal',
  'Medical',
  'Other',
];

export interface DocumentTag {
  id: number;
  name: string;
}

export interface DocumentSummary {
  id: number;
  title: string;
  kind: DocumentKind;
  issuer: string | null;
  /** Only ever the last 4 characters of the number. */
  numberLast4: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  isVault: boolean;
  fileCount: number;
  tags: DocumentTag[];
  createdAt: string;
}

export interface DocumentFile {
  id: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  /** Stored encrypted (vault); opening it needs the vault unlocked. */
  isEncrypted: boolean;
  createdAt: string;
}

export interface LifeDocument extends DocumentSummary {
  notes: string | null;
  expiryReminderDays: number | null;
  expiryReminderId: number | null;
  files: DocumentFile[];
}

export interface DocumentPayload {
  title: string;
  kind: DocumentKind;
  issuer: string | null;
  /** As typed; the API keeps only its last 4 letters/digits. */
  number: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  notes: string | null;
  isVault: boolean;
  expiryReminderDays: number | null;
  /** The browser's zone, for the expiry reminder's 09:00 when Settings has none. */
  timeZone: string | null;
  tagIds: number[];
}

export interface DocumentFilter {
  kind?: DocumentKind | null;
  search?: string | null;
  tagId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly vault = inject(VaultService);
  private readonly baseUrl = '/api/Documents/Documents';

  list(filter: DocumentFilter = {}): Observable<DocumentSummary[]> {
    let params = new HttpParams();
    if (filter.kind) {
      params = params.set('kind', filter.kind);
    }
    if (filter.search?.trim()) {
      params = params.set('search', filter.search.trim());
    }
    if (filter.tagId) {
      params = params.set('tagId', filter.tagId);
    }
    return this.http
      .get<ApiResponse<DocumentSummary[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<LifeDocument> {
    return this.http
      .get<ApiResponse<LifeDocument>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data!));
  }

  // Saving can write, move or remove the expiry reminder, so reminder lists refresh.
  create(payload: DocumentPayload): Observable<LifeDocument> {
    return this.http.post<ApiResponse<LifeDocument>>(this.baseUrl, payload).pipe(
      map((response) => response.data!),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  // Carries the vault unlock: taking a document out of the vault needs it (423 otherwise).
  update(id: number, payload: DocumentPayload): Observable<LifeDocument> {
    const headers = this.vault.headers();
    return this.http
      .put<ApiResponse<LifeDocument>>(`${this.baseUrl}/${id}`, payload, { headers })
      .pipe(
        map((response) => response.data!),
        tap(() => this.remindersService.notifyChanged()),
      );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }

  /** Uploads files to a document; all or none. Returns the document with its files. */
  uploadFiles(id: number, files: readonly File[]): Observable<LifeDocument> {
    const form = new FormData();
    files.forEach((file) => form.append('files', file, file.name));
    return this.http
      .post<ApiResponse<LifeDocument>>(`${this.baseUrl}/${id}/files`, form)
      .pipe(map((response) => response.data!));
  }

  replaceFile(id: number, fileId: number, file: File): Observable<LifeDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http
      .put<ApiResponse<LifeDocument>>(`${this.baseUrl}/${id}/files/${fileId}`, form)
      .pipe(map((response) => response.data!));
  }

  removeFile(id: number, fileId: number): Observable<LifeDocument> {
    return this.http
      .delete<ApiResponse<LifeDocument>>(`${this.baseUrl}/${id}/files/${fileId}`)
      .pipe(map((response) => response.data!));
  }

  /**
   * The file's bytes as a Blob of its real type, fetched with the login token (an <img> or <iframe> src can't send
   * it, and a token never goes in a URL). `raw=true` makes the API answer without a file name and with a neutral
   * type, so download managers such as IDM don't seize the response and leave the page with nothing; the type comes
   * from the file's own record instead. The caller turns it into an object URL and revokes it when done.
   * A vault document's file needs the vault unlocked (`ensureVaultUnlocked` first); the API answers 423 otherwise.
   */
  fileBlob(id: number, file: Pick<DocumentFile, 'id' | 'contentType'>): Observable<Blob> {
    const params = new HttpParams().set('raw', true);
    const headers = this.vault.headers();
    return this.http
      .get(`${this.baseUrl}/${id}/files/${file.id}`, { params, headers, responseType: 'blob' })
      .pipe(map((blob) => new Blob([blob], { type: file.contentType })));
  }
}
