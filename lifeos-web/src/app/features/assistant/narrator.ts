import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import {
  AssistantService,
  KeptNarration,
  Narration,
  NarrationScope,
} from '../../core/services/assistant.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { ToastService } from '../../core/services/toast.service';

/**
 * The Story narrator (Session 96): "Narrate" sends Mistral only the lines the host page shows (`lines`, the page's
 * own words) and shows the narration with exactly what was sent. Nothing is stored until Keep; a kept narration
 * shows on the page (with or without the assistant) until it's replaced or removed. Without a key, or with the
 * assistant off, there's no button and nothing is sent.
 */
@Component({
  selector: 'app-narrator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (draft(); as d) {
      <figure class="narration mb-2">
        <blockquote class="mb-1">{{ d.text }}</blockquote>
        <figcaption class="small text-body-secondary">
          Narrated by Mistral from the {{ sentCount() }} lines on this page — not saved unless you
          keep it.
        </figcaption>
      </figure>
      <div class="d-flex flex-wrap gap-2 d-print-none">
        <button
          type="button"
          class="btn btn-outline-primary btn-sm"
          [disabled]="busy()"
          (click)="keep(d)"
        >
          <i class="bi bi-bookmark"></i> Keep
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          [disabled]="busy()"
          (click)="narrate()"
        >
          Narrate again
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          [disabled]="busy()"
          (click)="draft.set(null)"
        >
          Discard
        </button>
      </div>
      <details class="small mt-2 d-print-none">
        <summary class="text-body-secondary">What was sent to Mistral</summary>
        @for (item of d.sent; track $index) {
          <div class="fw-semibold mt-2">{{ item.label }}</div>
          <pre class="sent-item border rounded p-2 mb-0">{{ item.content }}</pre>
        }
      </details>
    } @else if (kept(); as k) {
      <figure class="narration mb-2">
        <blockquote class="mb-1">{{ k.text }}</blockquote>
        <figcaption class="small text-body-secondary">
          Narration kept {{ k.keptAt | date }}.
        </figcaption>
      </figure>
      <div class="d-flex flex-wrap gap-2 d-print-none">
        @if (assistantOn()) {
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            [disabled]="busy()"
            (click)="narrate()"
          >
            Narrate again
          </button>
        }
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          [disabled]="busy()"
          (click)="remove()"
        >
          Remove narration
        </button>
      </div>
    } @else if (assistantOn()) {
      <button
        type="button"
        class="btn btn-outline-primary btn-sm d-print-none"
        [disabled]="busy() || lines().length === 0"
        (click)="narrate()"
      >
        <i class="bi bi-feather"></i> Narrate
      </button>
    }
    @if (busy() === 'narrating') {
      <div class="small text-body-secondary mt-2 d-print-none" role="status">
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        Narrating…
      </div>
    }
    @if (error(); as message) {
      <div class="small text-danger mt-2 d-print-none" role="alert">{{ message }}</div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    /* Nothing to show (no kept narration, assistant off): no empty card or spacing. */
    :host(:empty) {
      display: none;
    }
    .narration blockquote {
      font-size: 1rem;
      line-height: 1.6;
      white-space: pre-line;
      border-left: 3px solid var(--lifeos-teal);
      padding-left: 0.85rem;
    }
    .sent-item {
      max-height: 14rem;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 0.75rem;
    }
  `,
})
export class Narrator {
  private readonly assistant = inject(AssistantService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<NarrationScope>();
  /** Year scope only. */
  readonly year = input<number | null>(null);
  /** What the page shows, as plain lines — the only data Mistral gets. */
  readonly lines = input.required<string[]>();

  protected readonly assistantOn = signal(false);
  protected readonly kept = signal<KeptNarration | null>(null);
  protected readonly draft = signal<Narration | null>(null);
  protected readonly sentCount = signal(0);
  protected readonly busy = signal<'narrating' | 'keeping' | 'removing' | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.assistant
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => this.assistantOn.set(settings.hasKey && settings.isEnabled),
        // No button when the settings can't be read — the page itself still works.
        error: () => this.assistantOn.set(false),
      });

    effect(() => {
      const scope = this.scope();
      const year = this.year();
      untracked(() => {
        this.draft.set(null);
        this.error.set(null);
        this.kept.set(null);
        this.assistant
          .kept(scope, year)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (kept) => {
              if (scope === this.scope() && year === this.year()) {
                this.kept.set(kept);
              }
            },
            error: () => this.kept.set(null),
          });
      });
    });
  }

  protected narrate(): void {
    const lines = this.lines();
    this.busy.set('narrating');
    this.error.set(null);
    this.assistant
      .narrate(this.scope(), this.year(), lines)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (narration) => {
          this.sentCount.set(lines.filter((line) => line.trim()).length);
          this.draft.set(narration);
          this.busy.set(null);
        },
        error: (err) => {
          this.error.set(apiErrorMessage(err, 'Could not narrate this.'));
          this.busy.set(null);
        },
      });
  }

  protected keep(narration: Narration): void {
    this.busy.set('keeping');
    this.assistant
      .keep(this.scope(), this.year(), narration.text)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (kept) => {
          this.kept.set(kept);
          this.draft.set(null);
          this.busy.set(null);
          this.toast.success('Narration kept.');
        },
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Could not keep the narration.'));
          this.busy.set(null);
        },
      });
  }

  protected async remove(): Promise<void> {
    const answer = await Swal.fire({
      title: 'Remove this narration?',
      text: 'Only the kept narration goes — your story stays as it is.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove narration',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.busy.set('removing');
    this.assistant
      .removeKept(this.scope(), this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.kept.set(null);
          this.busy.set(null);
        },
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Could not remove the narration.'));
          this.busy.set(null);
        },
      });
  }
}
