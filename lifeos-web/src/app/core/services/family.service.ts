import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import { todayIso } from '../dates/today';

export type RelationshipKind = 'Parent' | 'Partner' | 'Sibling' | 'Other';
export type SignificantDateKind = 'Birthday' | 'Anniversary' | 'Other';

/** One edge of the family tree: the relative is the person's `kind` (a null side is you). */
export interface Relationship {
  id: number;
  personContactId: number | null;
  personName: string | null;
  relativeContactId: number | null;
  relativeName: string | null;
  kind: RelationshipKind;
  label: string | null;
}

export interface RelationshipPayload {
  personContactId: number | null;
  relativeContactId: number | null;
  kind: RelationshipKind;
  label: string | null;
}

/** A contact as the Family pages show them (place in the tree worked out by the API). */
export interface FamilyPerson {
  contactId: number;
  name: string;
  phone: string | null;
  email: string | null;
  isFamily: boolean;
  /** "Parent's sibling", "Cousin" — null when the tree doesn't connect them to you. */
  relation: string | null;
  /** Generations above (+) or below (−) you; null when not placed. */
  generation: number | null;
  nextBirthday: string | null;
  turnsAge: number | null;
  lastContactedOn: string | null;
}

export interface SignificantDate {
  id: number;
  contactId: number;
  contactName: string;
  otherContactId: number | null;
  otherContactName: string | null;
  kind: SignificantDateKind;
  label: string | null;
  month: number;
  day: number;
  year: number | null;
  notes: string | null;
  nextOn: string;
  daysUntil: number;
  yearsOnNext: number | null;
  /** "Asha turns 60", "Asha & Ravi's anniversary — 41 years". */
  title: string;
}

export interface SignificantDatePayload {
  contactId: number;
  otherContactId: number | null;
  kind: SignificantDateKind;
  label: string | null;
  month: number;
  day: number;
  year: number | null;
  notes: string | null;
}

/** A birthday or anniversary coming up (My Day). */
export interface UpcomingDay {
  id: number;
  contactId: number;
  kind: SignificantDateKind;
  title: string;
  on: string;
  daysUntil: number;
}

/** The Family API (`api/Family/{People,Relationships,Dates}`), Session 73. */
@Injectable({ providedIn: 'root' })
export class FamilyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Family';

  people(): Observable<FamilyPerson[]> {
    return this.http
      .get<ApiResponse<FamilyPerson[]>>(`${this.baseUrl}/People`, { params: { today: todayIso() } })
      .pipe(map((response) => response.data ?? []));
  }

  relationships(): Observable<Relationship[]> {
    return this.http
      .get<ApiResponse<Relationship[]>>(`${this.baseUrl}/Relationships`)
      .pipe(map((response) => response.data ?? []));
  }

  addRelationship(payload: RelationshipPayload): Observable<Relationship> {
    return this.http
      .post<ApiResponse<Relationship>>(`${this.baseUrl}/Relationships`, payload)
      .pipe(map((response) => response.data!));
  }

  removeRelationship(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Relationships/${id}`)
      .pipe(map(() => undefined));
  }

  /** Every significant date, next one first. */
  dates(): Observable<SignificantDate[]> {
    return this.http
      .get<ApiResponse<SignificantDate[]>>(`${this.baseUrl}/Dates`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data ?? []));
  }

  saveDate(id: number | null, payload: SignificantDatePayload): Observable<SignificantDate> {
    const body = { ...payload, today: todayIso() };
    const request = id
      ? this.http.put<ApiResponse<SignificantDate>>(`${this.baseUrl}/Dates/${id}`, body)
      : this.http.post<ApiResponse<SignificantDate>>(`${this.baseUrl}/Dates`, body);
    return request.pipe(map((response) => response.data!));
  }

  removeDate(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Dates/${id}`)
      .pipe(map(() => undefined));
  }
}
