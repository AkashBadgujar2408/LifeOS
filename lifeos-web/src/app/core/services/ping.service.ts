import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PingResponse {
  message: string;
  serverTimeUtc: string;
}

@Injectable({ providedIn: 'root' })
export class PingService {
  private readonly http = inject(HttpClient);

  ping(): Observable<PingResponse> {
    return this.http.get<PingResponse>('/api/Shared/Ping');
  }
}
