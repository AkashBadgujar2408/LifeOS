import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FamilyLogService, KeepInTouch } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';
import { CADENCE_CHOICES, cadenceText, dueText } from './family-log-view';

/**
 * "Keep in touch every …" for one person: set, change or clear the cadence, and see when the next touch is due
 * (worked out by the API from their last time in touch). Gentle — past due is a nudge, never a score. Re-reads when
 * `version` changes (the page bumps it after an interaction is logged).
 */
@Component({
  selector: 'app-person-keep-in-touch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, LoadError],
  template: `
    <section class="card" aria-labelledby="person-keep-heading">
      <div class="card-body">
        <h2 id="person-keep-heading" class="h6 mb-3">Keep in touch</h2>
        @if (loadFailed()) {
          <app-load-error message="Couldn't load the keep-in-touch reminder." (retry)="load()" />
        } @else if (!loaded()) {
          <p class="small text-body-secondary mb-0">Loading...</p>
        } @else if (!editing() && current(); as k) {
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="fw-semibold">{{ cadenceText(k.cadenceDays) }}</span>
            <span
              class="badge rounded-pill border fw-normal"
              [class.text-bg-light]="k.daysUntil >= 0"
              [class.bg-warning-subtle]="k.daysUntil < 0"
              [class.text-warning-emphasis]="k.daysUntil < 0"
            >
              @if (k.daysUntil < 0) {
                <i class="bi bi-hourglass-split me-1" aria-hidden="true"></i>
              }
              {{ dueText(k.daysUntil) }}
            </span>
          </div>
          <p class="small text-body-secondary mt-2 mb-3">
            @if (k.lastContactedOn) {
              Last in touch {{ k.lastContactedOn | date }} — next touch around {{ k.dueOn | date }}.
            } @else {
              No time in touch logged yet — next touch around {{ k.dueOn | date }}.
            }
          </p>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="edit(k)">
              Change
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" (click)="clear()">
              Stop reminding me
            </button>
          </div>
        } @else {
          @if (!editing()) {
            <p class="small text-body-secondary">
              Choose how often you'd like to be in touch. My Day will gently nudge you once it's
              been longer than that.
            </p>
          }
          <form
            class="d-flex flex-wrap align-items-start gap-2"
            [formGroup]="form"
            (ngSubmit)="save()"
            novalidate
          >
            <div>
              <label class="visually-hidden" for="keep-choice">How often</label>
              <select id="keep-choice" class="form-select form-select-sm" formControlName="choice">
                @for (c of choices; track c.days) {
                  <option [ngValue]="c.days" [selected]="c.days === form.controls.choice.value">
                    {{ c.label }}
                  </option>
                }
                <option [ngValue]="0" [selected]="form.controls.choice.value === 0">
                  Every … days
                </option>
              </select>
            </div>
            @if (form.controls.choice.value === 0) {
              <div style="width: 8rem">
                <label class="visually-hidden" for="keep-days">Days</label>
                <input
                  id="keep-days"
                  type="number"
                  min="1"
                  max="730"
                  class="form-control form-control-sm"
                  [class.is-invalid]="daysError()"
                  formControlName="days"
                  placeholder="e.g. 45"
                />
                @if (daysError(); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
            }
            <button type="submit" class="btn btn-sm btn-primary" [disabled]="saving()">Save</button>
            @if (editing()) {
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                (click)="editing.set(false)"
              >
                Cancel
              </button>
            }
          </form>
        }
      </div>
    </section>
  `,
})
export class PersonKeepInTouch {
  private readonly familyLog = inject(FamilyLogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly contactId = input.required<number>();
  /** Bump to re-read (after an interaction moved their last-in-touch day). */
  readonly version = input(0);
  readonly changed = output<void>();

  protected readonly choices = CADENCE_CHOICES;
  protected readonly cadenceText = cadenceText;
  protected readonly dueText = dueText;
  protected readonly current = signal<KeepInTouch | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);

  protected readonly form = this.fb.group({
    choice: this.fb.nonNullable.control(30),
    days: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(730)]),
  });

  constructor() {
    effect(() => {
      this.contactId();
      this.version();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.familyLog
      .keepInTouch(this.contactId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (k) => {
          this.current.set(k);
          this.loaded.set(true);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected edit(k: KeepInTouch): void {
    const preset = CADENCE_CHOICES.some((c) => c.days === k.cadenceDays);
    this.form.reset({ choice: preset ? k.cadenceDays : 0, days: preset ? null : k.cadenceDays });
    this.attempted.set(false);
    this.editing.set(true);
  }

  protected daysError(): string | null {
    const control = this.form.controls.days;
    if (!this.attempted() && !control.touched) {
      return null;
    }
    const days = control.value;
    return days === null || !Number.isInteger(days) || days < 1 || days > 730
      ? 'Choose between 1 and 730 days.'
      : null;
  }

  protected save(): void {
    this.attempted.set(true);
    const choice = this.form.controls.choice.value;
    if (choice === 0 && this.daysError()) {
      return;
    }
    const days = choice === 0 ? this.form.controls.days.value! : choice;
    this.saving.set(true);
    this.familyLog.setKeepInTouch(this.contactId(), days).subscribe({
      next: (k) => {
        this.saving.set(false);
        this.editing.set(false);
        this.current.set(k);
        this.toast.success(`${cadenceText(k.cadenceDays)} — noted.`);
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save it.'));
      },
    });
  }

  protected clear(): void {
    this.familyLog.clearKeepInTouch(this.contactId()).subscribe({
      next: () => {
        this.current.set(null);
        this.form.reset({ choice: 30, days: null });
        this.changed.emit();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not clear it.')),
    });
  }
}
