import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

export const CONTACT_ENTITY_TYPE = 'Contact';

/** A person in the one shared contact list (Career's network now; Family, Safety and Community later). */
export interface Contact {
  id: number;
  name: string;
  organisation: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  lastContactedOn: string | null;
  tags: Tag[];
}

export interface ContactPayload {
  name: string;
  organisation: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  lastContactedOn: string | null;
  today: string;
  /** Replaced as a whole on every save. */
  tagIds: number[];
}

/** The Contacts API (`api/Shared/Contacts`). */
@Injectable({ providedIn: 'root' })
export class ContactsService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Shared/Contacts';

  /** By name; only the ones with a tag when given. */
  list(tagId?: number): Observable<Contact[]> {
    const params = tagId ? new HttpParams().set('tagId', tagId) : undefined;
    return this.http
      .get<ApiResponse<Contact[]>>(this.base, { params })
      .pipe(map((response) => response.data ?? []));
  }

  get(id: number): Observable<Contact> {
    return this.http
      .get<ApiResponse<Contact>>(`${this.base}/${id}`)
      .pipe(map((response) => response.data!));
  }

  save(id: number | null, payload: ContactPayload): Observable<Contact> {
    const request = id
      ? this.http.put<ApiResponse<Contact>>(`${this.base}/${id}`, payload)
      : this.http.post<ApiResponse<Contact>>(this.base, payload);
    return request.pipe(map((response) => response.data!));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${id}`).pipe(
      map(() => undefined),
      tap(() => this.remindersService.notifyChanged()),
    );
  }
}
