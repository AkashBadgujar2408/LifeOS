import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
} from '../../core/services/assistant.service';
import { ModuleKey, SettingsService } from '../../core/services/settings.service';
import { AssistantKeyHelp } from './key-help';

/** Mirrors AssistantRules.MaxMessageLength. */
const MAX_MESSAGE_LENGTH = 2000;

const SUGGESTIONS: { text: string; module: ModuleKey | null }[] = [
  { text: 'What do I have on today?', module: null },
  { text: "What's on my calendar this week?", module: 'Calendar' },
  { text: 'Which tasks are overdue?', module: 'Tasks' },
  { text: 'How are my goals going?', module: 'Goals' },
  { text: 'How much did I spend this month, and on what?', module: 'Finance' },
  { text: 'How are my habit streaks?', module: 'Habits' },
];

/**
 * The assistant's chat, in a panel from the right (opened by AssistantPanelService). Before a key is set it shows
 * how to get one. Every answer can show what was sent to Mistral and which LifeOS lookups it used.
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
              Ask about your goals, tasks, calendar, habits, money and the rest of LifeOS. It reads
              your data to answer, but can't change anything yet. Questions not about LifeOS get a
              polite no.
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
            @for (turn of conversation(); track $index) {
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
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly settings = signal<AssistantSettings | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly pending = signal(false);
  protected readonly conversation = this.assistant.conversation;
  protected readonly maxLength = MAX_MESSAGE_LENGTH;

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
        this.scrollToEnd();
      },
      error: () => this.loadFailed.set(true),
    });
  }

  protected fieldError(name: 'question'): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
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
    this.form.markAllAsTouched();
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
