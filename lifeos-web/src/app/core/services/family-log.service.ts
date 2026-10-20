import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';
import { todayIso } from '../dates/today';

export type InteractionKind =
  'Call' | 'Video' | 'Message' | 'Meeting' | 'Visit' | 'Event' | 'Other';
export type GiftStatus = 'Idea' | 'Bought' | 'Given';
export type ResponsibilityHolder = 'Me' | 'Shared' | 'Someone';

export interface FamilyPersonRef {
  contactId: number;
  name: string;
}

/** Being in touch on a day, with one or more people. */
export interface Interaction {
  id: number;
  /** "yyyy-MM-dd". */
  occurredOn: string;
  kind: InteractionKind;
  summary: string | null;
  notes: string | null;
  people: FamilyPersonRef[];
}

export interface InteractionPayload {
  occurredOn: string;
  kind: InteractionKind;
  summary: string | null;
  notes: string | null;
  /** Everyone it was with — replaced as a whole on every save. */
  contactIds: number[];
}

/** A keep-in-touch cadence and where it stands today (worked out by the API, never stored). */
export interface KeepInTouch {
  contactId: number;
  name: string;
  cadenceDays: number;
  lastContactedOn: string | null;
  dueOn: string;
  /** Negative = that many days past. */
  daysUntil: number;
}

export interface GiftIdea {
  id: number;
  contactId: number;
  contactName: string;
  title: string;
  significantDateId: number | null;
  /** The significant date's title ("Asha's birthday") or the free-text occasion. */
  occasionTitle: string | null;
  occasion: string | null;
  status: GiftStatus;
  estimatedAmount: number | null;
  currency: string | null;
  link: string | null;
  purchaseId: number | null;
  purchaseTitle: string | null;
  givenOn: string | null;
  notes: string | null;
}

export interface GiftIdeaPayload {
  contactId: number;
  title: string;
  significantDateId: number | null;
  occasion: string | null;
  status: GiftStatus;
  estimatedAmount: number | null;
  currency: string | null;
  link: string | null;
  purchaseId: number | null;
  givenOn: string | null;
  notes: string | null;
}

export interface Responsibility {
  id: number;
  title: string;
  contactId: number | null;
  contactName: string | null;
  heldBy: ResponsibilityHolder;
  holderContactId: number | null;
  holderName: string | null;
  /** For a repeating task, its latest occurrence. */
  taskItemId: number | null;
  taskTitle: string | null;
  taskDueDate: string | null;
  taskDone: boolean;
  startedOn: string | null;
  endedOn: string | null;
  notes: string | null;
}

export interface ResponsibilityPayload {
  title: string;
  contactId: number | null;
  heldBy: ResponsibilityHolder;
  holderContactId: number | null;
  taskItemId: number | null;
  startedOn: string | null;
  endedOn: string | null;
  notes: string | null;
}

/** A significant date as the gift form needs it (`GET api/Family/Dates`, Session 73). */
export interface OccasionOption {
  id: number;
  contactId: number;
  otherContactId: number | null;
  title: string;
}

/** Family's log (Session 74): `api/Family/{Interactions,KeepInTouch,Gifts,Responsibilities}`. */
@Injectable({ providedIn: 'root' })
export class FamilyLogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Family';

  interactions(contactId?: number, take = 100): Observable<Interaction[]> {
    let params = new HttpParams().set('take', take);
    if (contactId !== undefined) {
      params = params.set('contactId', contactId);
    }
    return this.http
      .get<ApiResponse<Interaction[]>>(`${this.baseUrl}/Interactions`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  saveInteraction(id: number | null, payload: InteractionPayload): Observable<Interaction> {
    const body = { ...payload, today: todayIso() };
    const request = id
      ? this.http.put<ApiResponse<Interaction>>(`${this.baseUrl}/Interactions/${id}`, body)
      : this.http.post<ApiResponse<Interaction>>(`${this.baseUrl}/Interactions`, body);
    return request.pipe(map((response) => response.data!));
  }

  removeInteraction(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Interactions/${id}`)
      .pipe(map(() => undefined));
  }

  keepInTouchList(): Observable<KeepInTouch[]> {
    return this.http
      .get<ApiResponse<KeepInTouch[]>>(`${this.baseUrl}/KeepInTouch`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data ?? []));
  }

  /** Null when they have no cadence. */
  keepInTouch(contactId: number): Observable<KeepInTouch | null> {
    return this.http
      .get<ApiResponse<KeepInTouch | null>>(`${this.baseUrl}/KeepInTouch/${contactId}`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data ?? null));
  }

  setKeepInTouch(contactId: number, cadenceDays: number): Observable<KeepInTouch> {
    return this.http
      .put<ApiResponse<KeepInTouch>>(`${this.baseUrl}/KeepInTouch/${contactId}`, {
        cadenceDays,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  clearKeepInTouch(contactId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/KeepInTouch/${contactId}`)
      .pipe(map(() => undefined));
  }

  gifts(contactId?: number): Observable<GiftIdea[]> {
    const params = contactId === undefined ? undefined : { contactId };
    return this.http
      .get<ApiResponse<GiftIdea[]>>(`${this.baseUrl}/Gifts`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  saveGift(id: number | null, payload: GiftIdeaPayload): Observable<GiftIdea> {
    const body = { ...payload, today: todayIso() };
    const request = id
      ? this.http.put<ApiResponse<GiftIdea>>(`${this.baseUrl}/Gifts/${id}`, body)
      : this.http.post<ApiResponse<GiftIdea>>(`${this.baseUrl}/Gifts`, body);
    return request.pipe(map((response) => response.data!));
  }

  removeGift(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Gifts/${id}`)
      .pipe(map(() => undefined));
  }

  responsibilities(contactId?: number): Observable<Responsibility[]> {
    const params = contactId === undefined ? undefined : { contactId };
    return this.http
      .get<ApiResponse<Responsibility[]>>(`${this.baseUrl}/Responsibilities`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  saveResponsibility(
    id: number | null,
    payload: ResponsibilityPayload,
  ): Observable<Responsibility> {
    const request = id
      ? this.http.put<ApiResponse<Responsibility>>(
          `${this.baseUrl}/Responsibilities/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<Responsibility>>(`${this.baseUrl}/Responsibilities`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeResponsibility(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Responsibilities/${id}`)
      .pipe(map(() => undefined));
  }

  /** A person's significant dates, for a gift's occasion (`GET api/Family/Dates`, built in Session 73). */
  occasions(): Observable<OccasionOption[]> {
    return this.http
      .get<ApiResponse<OccasionOption[]>>(`${this.baseUrl}/Dates`, {
        params: { today: todayIso() },
      })
      .pipe(map((response) => response.data ?? []));
  }
}
