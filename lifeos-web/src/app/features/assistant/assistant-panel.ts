import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  AssistantService,
  AssistantSettings,
  ChatTurn,
  ProposalCard,
} from '../../core/services/assistant.service';
import { ModuleKey, SettingsService } from '../../core/services/settings.service';
import { AssistantKeyHelp } from './key-help';
import { notifySaved, openSavedItem } from './assistant-open';

/** Mirrors AssistantRules.MaxMessageLength. */
const MAX_MESSAGE_LENGTH = 2000;

const SUGGESTIONS: { text: string; module: ModuleKey | null }[] = [
  { text: 'What do I have on today?', module: null },
  { text: "What's on my calendar this week?", module: 'Calendar' },
  { text: 'Which tasks are overdue?', module: 'Tasks' },
  { text: 'How are my goals going?', module: 'Goals' },
  { text: 'How much did I spend this month, and on what?', module: 'Finance' },
  { text: 'How are my habit streaks?', module: 'Habits' },
  { text: 'Add a task to call the bank tomorrow', module: 'Tasks' },
];

/**
 * The assistant's chat, in a panel from the right (opened by AssistantPanelService). Before a key is set it shows
 * how to get one. Every answer can show what was sent to Mistral and which LifeOS lookups it used. A create/update it
 * proposes is a card: nothing is saved until Confirm, and there is no delete.
 */
@Component({
  selector: 'app-assistant-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AssistantKeyHelp],
  host: { class: 'd-flex flex-column h-100' },
  template: `
    <div class="offcanvas-header border-bottom justify-content-between gap-2">
      <h2 id="assistant-title" class="offcanvas-title h5 mb-0">
        <i class="bi bi-chat-dots" aria-hidden="true"></i> Assistant
      </h2>
      <div class="d-flex align-items-center gap-1">
        @if (conversation().length > 0) {
          <button
            type="button"
            class="btn btn-sm btn-link text-body-secondary"
            [disabled]="pending()"
            (click)="clear()"
          >
            Clear chat
          </button>
        }
        <button
          type="button"
          class="btn-close"
          aria-label="Close the assistant"
          (click)="activeOffcanvas.dismiss()"
        ></button>
      </div>
    </div>

    <div #scroller class="offcanvas-body flex-grow-1 overflow-auto">
      @if (loadFailed()) {
        <p class="small text-body-secondary">
          Couldn't load the assistant.
          <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
            Try again
          </button>
        </p>
      } @else if (settings(); as s) {
        @if (!s.hasKey) {
          <p class="small">
            The assistant answers questions about your own LifeOS data. It runs on
            <strong>your own Mistral API key</strong> — add one in Settings to start.
          </p>
          <app-assistant-key-help />
          <button type="button" class="btn btn-primary mt-3" (click)="openSettings()">
            Open Settings › AI assistant
          </button>
        } @else if (!s.isEnabled) {
          <p class="small">
            Your key is saved, but the assistant is switched off. Switch it on in Settings › AI
            assistant.
          </p>
          <button type="button" class="btn btn-primary" (click)="openSettings()">
            Open Settings
          </button>
        } @else {
          @if (conversation().length === 0) {
            <p class="small text-body-secondary">
              Ask about your goals, tasks, calendar, habits, money and the rest of LifeOS, or ask it
              to add or change something — it shows a card and saves only when you press Confirm. It
              never deletes anything. Questions not about LifeOS get a polite no.
            </p>
            <div
              class="d-flex flex-column align-items-start gap-2"
              aria-label="Suggested questions"
            >
              @for (suggestion of suggestions(); track suggestion) {
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary text-start"
                  (click)="send(suggestion)"
                >
                  {{ suggestion }}
                </button>
              }
            </div>
          }

          <ol class="list-unstyled d-flex flex-column gap-3 mb-0" aria-live="polite">
            @for (turn of conversation(); track $index; let i = $index) {
              @if (turn.role === 'user') {
                <li class="align-self-end bg-body-secondary rounded-3 px-3 py-2 chat-bubble">
                  <span class="visually-hidden">You: </span>{{ turn.content }}
                </li>
              } @else {
                <li class="chat-bubble">
                  <div
                    class="rounded-3 px-3 py-2 border"
                    [class.border-danger-subtle]="turn.failed"
                    [class.text-danger]="turn.failed"
                  >
                    <span class="visually-hidden">Assistant: </span>{{ turn.content }}
                  </div>
                  @for (card of turn.proposals; track $index; let c = $index) {
                    <div
                      class="border rounded-3 p-3 mt-2 proposal"
                      [class.border-success]="card.state === 'done'"
                      role="group"
                      [attr.aria-label]="card.title"
                    >
                      <div class="fw-semibold">{{ card.title }}</div>
                      @if (card.lines.length) {
                        <dl class="small mt-2 mb-0">
                          @for (line of card.lines; track $index) {
                            <div class="d-flex gap-2">
                              <dt class="fw-normal text-body-secondary proposal-label">
                                {{ line.label }}
                              </dt>
                              <dd class="mb-1 min-w-0">
                                @if (line.before !== null) {
                                  <span class="text-body-secondary text-decoration-line-through">{{
                                    line.before
                                  }}</span>
                                  <span class="visually-hidden"> changes to </span>
                                  <i class="bi bi-arrow-right mx-1" aria-hidden="true"></i>
                                }
                                {{ line.value }}
                              </dd>
                            </div>
                          }
                        </dl>
                      }
                      <div class="mt-2" aria-live="polite">
                        @switch (card.state) {
                          @case ('waiting') {
                            <div class="d-flex gap-2">
                              <button
                                type="button"
                                class="btn btn-primary btn-sm"
                                (click)="confirm(i, c)"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                class="btn btn-outline-secondary btn-sm"
                                (click)="cancel(i, c)"
                              >
                                Cancel
                              </button>
                            </div>
                          }
                          @case ('saving') {
                            <span class="small text-body-secondary" role="status">
                              <span
                                class="spinner-border spinner-border-sm"
                                aria-hidden="true"
                              ></span>
                              Saving…
                            </span>
                          }
                          @case ('done') {
                            <div class="small d-flex flex-wrap align-items-center gap-2">
                              <span class="text-success">
                                <i class="bi bi-check-circle" aria-hidden="true"></i> Saved
                              </span>
                              <button
                                type="button"
                                class="btn btn-link btn-sm p-0"
                                (click)="openItem(card)"
                              >
                                Open {{ card.result!.title }}
                              </button>
                            </div>
                          }
                          @case ('cancelled') {
                            <span class="small text-body-secondary"
                              >Cancelled — nothing was saved.</span
                            >
                          }
                          @case ('failed') {
                            <div class="small text-danger mb-2">Not saved: {{ card.error }}</div>
                            <div class="d-flex gap-2">
                              <button
                                type="button"
                                class="btn btn-outline-primary btn-sm"
                                (click)="confirm(i, c)"
                              >
                                Try again
                              </button>
                              <button
                                type="button"
                                class="btn btn-outline-secondary btn-sm"
                                (click)="cancel(i, c)"
                              >
                                Cancel
                              </button>
                            </div>
                          }
                        }
                      </div>
                    </div>
                  }
                  @if (turn.lookups?.length) {
                    <div class="small text-body-secondary mt-1">
                      Looked at: {{ turn.lookups!.join(', ') }}
                    </div>
                  }
                  @if (turn.sent?.length) {
                    <details class="small mt-1">
                      <summary class="text-body-secondary">What was sent to Mistral</summary>
                      @for (item of turn.sent; track $index) {
                        <div class="fw-semibold mt-2">{{ item.label }}</div>
                        <pre class="sent-item border rounded p-2 mb-0">{{ item.content }}</pre>
                      }
                    </details>
                  }
                </li>
              }
            }
            @if (pending()) {
              <li class="small text-body-secondary" role="status">
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                Looking it up…
              </li>
            }
          </ol>
        }
      } @else {
        <p class="small text-body-secondary">Loading...</p>
      }
    </div>

    @if (settings()?.hasKey && settings()?.isEnabled) {
      <form class="border-top p-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label for="assistant-question" class="visually-hidden">Your question</label>
        <div class="d-flex gap-2 align-items-end">
          <textarea
            id="assistant-question"
            class="form-control"
            rows="2"
            formControlName="question"
            placeholder="Ask about your LifeOS — e.g. what's due this week?"
            [attr.maxlength]="maxLength"
            [class.is-invalid]="fieldError('question')"
            (keydown.enter)="onEnter($event)"
          ></textarea>
          <button type="submit" class="btn btn-primary" [disabled]="pending()" aria-label="Send">
            <i class="bi bi-send" aria-hidden="true"></i>
          </button>
        </div>
        @if (fieldError('question'); as error) {
          <div class="invalid-feedback d-block">{{ error }}</div>
        }
        <div class="form-text">Enter sends, Shift+Enter adds a line.</div>
      </form>
    }
  `,
  styles: `
    .chat-bubble {
      max-width: 90%;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .proposal {
      white-space: normal;
    }
    .proposal-label {
      flex: 0 0 6.5rem;
    }
    .sent-item {
      max-height: 14rem;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 0.75rem;
    }
  `,
})
export class AssistantPanel implements OnInit {
  protected readonly activeOffcanvas = inject(NgbActiveOffcanvas);
  private readonly assistant = inject(AssistantService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly settings = signal<AssistantSettings | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly pending = signal(false);
  protected readonly conversation = this.assistant.conversation;
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  /** Errors show only once Send is pressed — an emptied box after sending (or clicking away) is not a mistake. */
  private readonly submitted = signal(false);

  /** Suggestions without the modules switched off. */
  protected readonly suggestions = computed(() => {
    const hidden = this.settingsService.hiddenModules();
    return SUGGESTIONS.filter((s) => s.module === null || !hidden.has(s.module)).map((s) => s.text);
  });

  protected readonly form = this.fb.nonNullable.group({
    question: ['', [Validators.required, Validators.maxLength(MAX_MESSAGE_LENGTH)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);
    this.assistant.settings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        const question = this.pendingQuestion;
        this.pendingQuestion = null;
        if (question && settings.hasKey && settings.isEnabled && !this.pending()) {
          this.send(question);
        }
        this.scrollToEnd();
      },
      error: () => this.loadFailed.set(true),
    });
  }

  protected fieldError(name: 'question'): string | null {
    const control = this.form.controls[name];
    if (!this.submitted()) {
      return null;
    }
    if (control.hasError('required') || !control.value.trim()) {
      return 'Type a question first.';
    }
    return control.hasError('maxlength') ? `Keep it under ${MAX_MESSAGE_LENGTH} characters.` : null;
  }

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }
    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    this.submitted.set(true);
    const question = this.form.controls.question.value.trim();
    if (this.form.invalid || !question || this.pending()) {
      return;
    }
    this.send(question);
  }

  protected send(question: string): void {
    const turns: ChatTurn[] = [...this.conversation(), { role: 'user', content: question }];
    this.conversation.set(turns);
    this.form.reset();
    this.submitted.set(false);
    this.pending.set(true);
    this.scrollToEnd();

    this.assistant.ask(turns).subscribe({
      next: (reply) => {
        this.conversation.update((all) => [
          ...all,
          {
            role: 'assistant',
            content: reply.reply,
            refused: reply.refused,
            lookups: reply.lookups,
            sent: reply.sent,
            proposals: reply.proposals.map((proposal) => ({ ...proposal, state: 'waiting' })),
          },
        ]);
        this.pending.set(false);
        this.scrollToEnd();
      },
      error: (err) => {
        this.conversation.update((all) => [
          ...all,
          {
            role: 'assistant',
            content: apiErrorMessage(err, "Couldn't get an answer."),
            failed: true,
          },
        ]);
        this.pending.set(false);
        this.scrollToEnd();
      },
    });
  }

  /** Confirm on a card: written by the server through the module's service, or refused in its own words. */
  protected confirm(turnIndex: number, cardIndex: number): void {
    const card = this.conversation()[turnIndex]?.proposals?.[cardIndex];
    if (!card || card.state === 'saving' || card.state === 'done') {
      return;
    }
    this.setCard(turnIndex, cardIndex, { state: 'saving', error: undefined });
    this.assistant.confirm(card).subscribe({
      next: (result) => {
        this.setCard(turnIndex, cardIndex, { state: 'done', result });
        notifySaved(this.injector, result.entityType);
      },
      error: (err) =>
        this.setCard(turnIndex, cardIndex, {
          state: 'failed',
          error: apiErrorMessage(err, "Couldn't save it."),
        }),
    });
  }

  protected cancel(turnIndex: number, cardIndex: number): void {
    this.setCard(turnIndex, cardIndex, { state: 'cancelled' });
  }

  protected openItem(card: ProposalCard): void {
    if (!card.result) {
      return;
    }
    this.activeOffcanvas.dismiss();
    void openSavedItem(this.injector, card.result.entityType, card.result.entityId);
  }

  private setCard(turnIndex: number, cardIndex: number, patch: Partial<ProposalCard>): void {
    this.conversation.update((all) =>
      all.map((turn, t) =>
        t !== turnIndex || !turn.proposals
          ? turn
          : {
              ...turn,
              proposals: turn.proposals.map((card, c) =>
                c === cardIndex ? { ...card, ...patch } : card,
              ),
            },
      ),
    );
  }

  /** Quick Add's "Ask the assistant" opens the panel with its line already sent. */
  ask(question: string): void {
    const text = question.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) {
      return;
    }
    // The settings decide whether the chat can answer; wait for them on the first open.
    if (this.settings()?.hasKey && this.settings()?.isEnabled) {
      this.send(text);
    } else {
      this.pendingQuestion = text;
    }
  }

  private pendingQuestion: string | null = null;

  protected clear(): void {
    this.conversation.set([]);
  }

  protected openSettings(): void {
    this.activeOffcanvas.dismiss();
    void this.router.navigate(['/settings'], { fragment: 'assistant-heading' });
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const element = this.scroller()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
