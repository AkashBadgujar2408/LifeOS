import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { apiErrorMessage } from './api-error';
import { ToastService } from './toast.service';
import { ApiResponse } from './api-response';

export interface LifeArea {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class LifeAreasService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  // A fixed, seeded taxonomy that's the same for every user: fetch once per app session.
  private readonly all$ = this.http.get<ApiResponse<LifeArea[]>>('/api/Shared/LifeAreas').pipe(
    map((response) => response.data ?? []),
    shareReplay(1),
  );

  /**
   * Never errors: on failure it reports once and yields an empty list, so pickers and filters (often bound through
   * toSignal, which would rethrow into the template) degrade to "no life areas" instead of breaking the page.
   * shareReplay resets after an error, so the next caller tries again.
   */
  list(): Observable<LifeArea[]> {
    return this.all$.pipe(
      catchError((err) => {
        this.toast.error(apiErrorMessage(err, 'Could not load life areas.'));
        return of([]);
      }),
    );
  }
}
