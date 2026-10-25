import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { browserTimeZone, todayIso } from '../dates/today';
import { ApiResponse } from './api-response';
import { AuthService } from './auth.service';
import type { ForecastItem } from './finance.service';
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

export interface PredictedPoint {
  day: string;
  /** Expected: known money + each pattern's typical amount. */
  balance: number;
  /** Patterns at their worst (income low, spending high) and best. */
  low: number;
  high: number;
}

export interface PredictedLine {
  /** Null for the overall line (all accounts, in the base currency). */
  accountId: number | null;
  name: string;
  currency: string;
  start: number;
  end: PredictedPoint;
  lowest: PredictedPoint;
  /** Today, then one point a month. */
  points: PredictedPoint[];
}

/** A pattern Mistral read from past income/spending — a month's typical amount, its range and its confidence. */
export interface MoneyPattern {
  name: string;
  kind: 'Income' | 'Expense';
  accountId: number | null;
  lineName: string;
  typical: number;
  low: number;
  high: number;
  confidence: number;
  basis: string;
  from: string[];
}

/**
 * The Forecast tab (Session 96a): Mistral reads the patterns and its own probability; LifeOS adds them and the money
 * already known to be coming to today's balances. Saved per horizon until Predict again.
 */
export interface ForecastPrediction {
  months: 3 | 6 | 12;
  from: string;
  until: string;
  predictedAt: string;
  baseCurrency: string;
  model: string;
  overall: PredictedLine;
  accounts: PredictedLine[];
  patterns: MoneyPattern[];
  /** Mistral's own 0–100 estimate that the money turns out as predicted (within the low–high range). */
  confidence: number;
  confidenceReason: string;
  summary: string;
  historyFrom: string | null;
  historyTo: string | null;
  /** The money already known to be coming. */
  items: ForecastItem[];
  unconverted: string[];
  sent: SentItem[];
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
  /** Assistant turns: creates/updates waiting for Confirm (nothing is saved before). */
  proposals?: ProposalCard[];
}

export interface ProposalLine {
  label: string;
  value: string;
  /** On an update: what it was before. */
  before: string | null;
}

/** A confirmation card as the server checked it; action + arguments go back unchanged on Confirm. */
export interface Proposal {
  action: string;
  arguments: string;
  title: string;
  lines: ProposalLine[];
}

export type ProposalState = 'waiting' | 'saving' | 'done' | 'cancelled' | 'failed';

export interface ProposalCard extends Proposal {
  state: ProposalState;
  /** Failed: why, in the module's own words. */
  error?: string;
  /** Done: what was written. */
  result?: ActionResult;
}

export interface ActionResult {
  kind: 'Created' | 'Updated';
  entityType: string;
  entityId: number;
  title: string;
  message: string;
}

/** One entry of "What the assistant saved". */
export interface ActionLogEntry {
  id: number;
  action: string;
  kind: 'Created' | 'Updated';
  entityType: string;
  entityId: number;
  summary: string;
  createdAt: string;
}

export type NarrationScope = 'Recap' | 'Year';

/** A narration from the page's lines, and everything sent to Mistral for it. Not stored. */
export interface Narration {
  text: string;
  sent: SentItem[];
}

/** A narration the user kept for the recap or a year. */
export interface KeptNarration {
  scope: NarrationScope;
  year: number | null;
  text: string;
  keptAt: string;
}

function narrationParams(scope: NarrationScope, year: number | null): Record<string, string> {
  return year === null ? { scope } : { scope, year: String(year) };
}

interface ChatReply {
  reply: string;
  refused: boolean;
  lookups: string[];
  sent: SentItem[];
  proposals: Proposal[];
}

/** What the model is told about a card later in the chat, so "and add another" follows on. */
function cardNote(card: ProposalCard): string {
  switch (card.state) {
    case 'done':
      return `[${card.title} — confirmed and saved]`;
    case 'cancelled':
      return `[${card.title} — cancelled by the user, not saved]`;
    case 'failed':
      return `[${card.title} — not saved: ${card.error ?? 'refused'}]`;
    default:
      return `[${card.title} — not confirmed yet]`;
  }
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
      .map((turn) => ({
        role: turn.role,
        content: turn.proposals?.length
          ? [turn.content, ...turn.proposals.map(cardNote)].join('\n')
          : turn.content,
      }));
    return this.http
      .post<ApiResponse<ChatReply>>(
        `${this.baseUrl}/Chat`,
        { messages, today: todayIso(), timeZone: browserTimeZone() },
        { headers: this.vault.headers() },
      )
      .pipe(map((response) => response.data!));
  }

  /** Confirm on a card: the server checks it again and writes it through the module's own service. */
  confirm(proposal: Proposal): Observable<ActionResult> {
    return this.http
      .post<ApiResponse<ActionResult>>(`${this.baseUrl}/Actions/confirm`, {
        action: proposal.action,
        arguments: proposal.arguments,
        today: todayIso(),
        timeZone: browserTimeZone(),
      })
      .pipe(map((response) => response.data!));
  }

  /** What the assistant saved, newest first. */
  actionLog(take = 50): Observable<ActionLogEntry[]> {
    return this.http
      .get<ApiResponse<ActionLogEntry[]>>(`${this.baseUrl}/Actions`, { params: { take } })
      .pipe(map((response) => response.data!));
  }

  /** The Story narrator: Mistral gets only these lines (the page's own words) and the narrator's instructions. */
  narrate(scope: NarrationScope, year: number | null, lines: string[]): Observable<Narration> {
    return this.http
      .post<ApiResponse<Narration>>(`${this.baseUrl}/Narrations`, {
        scope,
        year,
        lines,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  kept(scope: NarrationScope, year: number | null): Observable<KeptNarration | null> {
    return this.http
      .get<ApiResponse<KeptNarration | null>>(`${this.baseUrl}/Narrations/kept`, {
        params: narrationParams(scope, year),
      })
      .pipe(map((response) => response.data ?? null));
  }

  keep(scope: NarrationScope, year: number | null, text: string): Observable<KeptNarration> {
    return this.http
      .put<ApiResponse<KeptNarration>>(`${this.baseUrl}/Narrations/kept`, {
        scope,
        year,
        text,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }

  removeKept(scope: NarrationScope, year: number | null): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.baseUrl}/Narrations/kept`, {
        params: narrationParams(scope, year),
      })
      .pipe(map(() => undefined));
  }

  /** The saved forecast for 3, 6 or 12 months, or null — never asks Mistral. */
  savedForecast(months: 3 | 6 | 12): Observable<ForecastPrediction | null> {
    return this.http
      .get<ApiResponse<ForecastPrediction | null>>(`${this.baseUrl}/Forecast`, {
        params: { months },
      })
      .pipe(map((response) => response.data ?? null));
  }

  /** Asks Mistral again (the user's own key) and saves the new forecast in place of the old one. */
  predictForecast(months: 3 | 6 | 12): Observable<ForecastPrediction> {
    return this.http
      .post<ApiResponse<ForecastPrediction>>(`${this.baseUrl}/Forecast`, {
        months,
        today: todayIso(),
      })
      .pipe(map((response) => response.data!));
  }
}
