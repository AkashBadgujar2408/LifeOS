import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { ApiResponse } from './api-response';

export interface LifeArea {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class LifeAreasService {
  private readonly http = inject(HttpClient);

  // A fixed, seeded taxonomy that's the same for every user: fetch once per app session.
  private readonly all$ = this.http.get<ApiResponse<LifeArea[]>>('/api/Shared/LifeAreas').pipe(
    map((response) => response.data ?? []),
    shareReplay(1),
  );

  list(): Observable<LifeArea[]> {
    return this.all$;
  }
}
