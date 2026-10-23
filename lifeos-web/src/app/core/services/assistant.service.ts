import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { browserTimeZone, todayIso } from '../dates/today';
import { ApiResponse } from './api-response';
import { AuthService } from './auth.service';
import { VaultService } from './vault.service';

export interface AssistantModel {
  id: string;
  label: string;
}

/** The assistant's settings. The key itself never comes back — only that it's set, its last four and when. */
export interface AssistantSettings {
  isEnabled: boolean;
  model: string;
  hasKey: boolean;
  keyLast4: string | null;
  keySetAt: string | null;
  models: AssistantModel[];
}

export interface AssistantKeyTest {
  works: boolean;
  message: string;
}

export type ChatRole = 'user' | 'assistant';

/** One thing that went to Mistral for an answer. */
export interface SentItem {
  label: string;
  content: string;
}

export interface ChatTurn {
  role: ChatRole;
  content: string;
  /** Assistant turns: the fixed off-topic reply. */
  refused?: boolean;
  /** Assistant turns: the LifeOS lookups used. */
  lookups?: string[];
  /** Assistant turns: everything sent to Mistral for this answer. */
  sent?: SentItem[];
  /** Assistant turns: the request failed; the text is the error. */
  failed?: boolean;
}

interface ChatReply {
  reply: string;
  refused: boolean;
  lookups: string[];
  sent: SentItem[];
}

/**
 * The AI assistant (api/Assistant): settings with the user's own Mistral key, and the chat. The conversation lives
 * only here, in memory — nothing is stored on the server — and is cleared on logout.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly vault = inject(VaultService);
  private readonly baseUrl = '/api/Assistant';

  /** The chat so far, oldest first. */
  readonly conversation = signal<ChatTurn[]>([]);

  constructor() {
    const auth = inject(AuthService);
    effect(() => {
      if (!auth.isAuthenticated()) {
        this.conversation.set([]);
      }
    });
  }

  settings(): Observable<AssistantSettings> {
    return this.http
      .get<ApiResponse<AssistantSettings>>(`${this.baseUrl}/Settings`)
      .pipe(map((response) => response.data!));
  }

  saveKey(apiKey: string): Observable<AssistantSettings> {
    return this.http
      .put<ApiResponse<AssistantSettings>>(`${this.baseUrl}/Settings/key`, { apiKey })
      .pipe(map((response) => response.data!));
  }

  removeKey(): Observable<AssistantSettings> {
    return this.http
      .delete<ApiResponse<AssistantSettings>>(`${this.baseUrl}/Settings/key`)
      .pipe(map((response) => response.data!));
  }

  updatePreferences(isEnabled: boolean, model: string): Observable<AssistantSettings> {
    return this.http
      .put<ApiResponse<AssistantSettings>>(`${this.baseUrl}/Settings/preferences`, {
        isEnabled,
        model,
      })
      .pipe(map((response) => response.data!));
  }

  testKey(): Observable<AssistantKeyTest> {
    return this.http
      .post<ApiResponse<AssistantKeyTest>>(`${this.baseUrl}/Settings/test`, {})
      .pipe(map((response) => response.data!));
  }

  /**
   * Asks about the conversation so far (its last turn is the new question). Sends the vault unlock only when it's
   * already open — the chat never asks for it, so locked Health stays out.
   */
  ask(turns: ChatTurn[]): Observable<ChatReply> {
    const messages = turns
      .filter((turn) => !turn.failed)
      .map((turn) => ({ role: turn.role, content: turn.content }));
    return this.http
      .post<ApiResponse<ChatReply>>(
        `${this.baseUrl}/Chat`,
        { messages, today: todayIso(), timeZone: browserTimeZone() },
        { headers: this.vault.headers() },
      )
      .pipe(map((response) => response.data!));
  }
}
