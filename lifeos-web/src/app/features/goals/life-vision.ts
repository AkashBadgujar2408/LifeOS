import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  Injector,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { GoalsService } from '../../core/services/goals.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';

const MAX_LENGTH = 2000;

/**
 * The user's life vision — one statement of where their life is heading. Shown (and edited in place) atop Goals and
 * as the premise of the Life Story; fetches and saves itself (api/Goals/Vision). A failed load just hides the card:
 * it's context, not the page's content.
 */
@Component({
  selector: 'app-life-vision',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    @if (loaded()) {
      <section class="card life-vision" [attr.aria-labelledby]="headingId">
        <div class="card-body p-4">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h2
              [id]="headingId"
              class="h6 text-uppercase text-body-secondary small mb-0 life-vision-label"
            >
              {{ heading() }}
            </h2>
            @if (!editing() && vision()) {
              <button type="button" class="btn btn-link btn-sm p-0" (click)="edit()">
                <i class="bi bi-pencil" aria-hidden="true"></i> Edit
              </button>
            }
          </div>

          @if (editing()) {
            <form (ngSubmit)="save()">
              <label class="visually-hidden" [for]="headingId + '-text'">Your life vision</label>
              <textarea
                #box
                [id]="headingId + '-text'"
                class="form-control"
                rows="3"
                [formControl]="text"
                [class.is-invalid]="fieldError()"
                placeholder="e.g. A calm, curious life: healthy enough to hike at 70, close to family, building things that last."
              ></textarea>
              @if (fieldError(); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
              <div class="d-flex flex-wrap gap-2 mt-2">
                <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving()">
                  Save
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancel()">
                  Cancel
                </button>
                <span class="small text-body-secondary ms-auto align-self-center">
                  Leave it empty to remove it.
                </span>
              </div>
            </form>
          } @else if (vision(); as text) {
            <p class="life-vision-text mb-0 text-break">{{ text }}</p>
          } @else {
            <p class="text-body-secondary mb-2">
              Where is your life heading? Put it in a sentence or two. It sits above your goals and
              opens your story, so every goal has something to answer to.
            </p>
            <button type="button" class="btn btn-outline-primary btn-sm" (click)="edit()">
              <i class="bi bi-compass" aria-hidden="true"></i> Write your vision
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .life-vision {
      border-left: 3px solid var(--lifeos-teal);
    }
    .life-vision-label {
      letter-spacing: 0.06em;
    }
    .life-vision-text {
      font-family: Sora, sans-serif;
      font-size: 1.1rem;
      line-height: 1.5;
      white-space: pre-line;
    }
  `,
})
export class LifeVision {
  private readonly goalsService = inject(GoalsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  /** "Life vision" on Goals, "The premise" in the story. */
  readonly heading = input('Life vision');

  private static nextId = 0;
  protected readonly headingId = `life-vision-${LifeVision.nextId++}`;

  protected readonly loaded = signal(false);
  protected readonly vision = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly text = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(MAX_LENGTH)],
  });

  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  constructor() {
    this.goalsService
      .getVision()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (text) => {
          this.vision.set(text);
          this.loaded.set(true);
        },
        error: () => undefined,
      });
  }

  protected fieldError(): string | null {
    return this.text.errors?.['maxlength'] ? `Keep it under ${MAX_LENGTH} characters.` : null;
  }

  protected edit(): void {
    this.text.setValue(this.vision() ?? '');
    this.editing.set(true);
    afterNextRender(() => this.box()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected save(): void {
    if (this.text.invalid) {
      this.text.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.goalsService
      .saveVision(this.text.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (text) => {
          this.saving.set(false);
          this.vision.set(text);
          this.editing.set(false);
          this.toast.success(text ? 'Vision saved.' : 'Vision removed.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save your vision.'));
        },
      });
  }
}
