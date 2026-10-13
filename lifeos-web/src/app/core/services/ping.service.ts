import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PingResponse {
  message: string;
  serverTimeUtc: string;
}

@Injectable({ providedIn: 'root' })
export class PingService {
  constructor(private readonly http: HttpClient) {}

  ping(): Observable<PingResponse> {
    return this.http.get<PingResponse>('/api/Shared/Ping');
  }
}
