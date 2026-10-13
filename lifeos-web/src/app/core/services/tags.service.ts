import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Tag {
  id: number;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: string[] | null;
}

@Injectable({ providedIn: 'root' })
export class TagsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/Tags';

  list(): Observable<Tag[]> {
    return this.http.get<ApiResponse<Tag[]>>(this.baseUrl).pipe(map((response) => response.data ?? []));
  }

  create(name: string): Observable<Tag> {
    return this.http
      .post<ApiResponse<Tag>>(this.baseUrl, { name })
      .pipe(map((response) => response.data!));
  }

  rename(id: number, name: string): Observable<Tag> {
    return this.http
      .put<ApiResponse<Tag>>(`${this.baseUrl}/${id}`, { name })
      .pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
