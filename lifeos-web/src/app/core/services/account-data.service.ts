import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import { VaultService } from './vault.service';

/** What an import brought in. */
export interface ImportSummary {
  rows: number;
  files: number;
  /** File rows left out because the export didn't carry their bytes. */
  filesMissing: number;
  tables: { table: string; rows: number }[];
}

/** Your data: export everything as a zip, import an export into an empty account, delete the account for good. */
@Injectable({ providedIn: 'root' })
export class AccountDataService {
  private readonly http = inject(HttpClient);
  private readonly vault = inject(VaultService);
  private readonly base = '/api/Shared/Account';

  /**
   * The export's bytes. Fetched with ?raw=true (neutral type, no file name) so a download manager doesn't seize the
   * response — the page saves it itself. Sends the vault unlock, since vault files are included; a 423 means unlock first.
   */
  export(): Observable<Blob> {
    return this.http
      .get(`${this.base}/export`, {
        params: { raw: true },
        headers: this.vault.headers(),
        responseType: 'blob',
      })
      .pipe(map((blob) => new Blob([blob], { type: 'application/zip' })));
  }

  import(file: File): Observable<ImportSummary> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<ApiResponse<ImportSummary>>(`${this.base}/import`, form)
      .pipe(map((response) => response.data!));
  }

  /** Erases the account and everything in it. The caller logs out afterwards. */
  deleteAccount(password: string, confirmation: string): Observable<void> {
    return this.http
      .post<ApiResponse<boolean>>(`${this.base}/delete`, { password, confirmation })
      .pipe(map(() => undefined));
  }
}
