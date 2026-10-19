import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthLockedError, HealthService, Wellness } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend, TrendSeries } from './health-trend';

const DAYS = 30;
export const STRESS_WORDS = ['Calm', 'Settled', 'Some pressure', 'Stressed', 'Overwhelmed'];
export const ENERGY_WORDS = ['Drained', 'Low', 'Okay', 'Good', 'Full of it'];

/**
 * How you've been: today's check-in (stress, energy, a private note) and the last 30 days of it beside the journal's
 * mood. All three are 1–5, so they share one axis — never a second one.
 */
@Component({
  selector: 'app-health-wellness',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Wellbeing</h1>
        <p class="text-body-secondary mb-0 small">
          A quick check-in on stress and energy, read beside the mood you give in your
          <a routerLink="/journal">journal</a>.
        </p>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="card mb-3">
          <form
            class="card-body d-flex flex-column gap-3"
            [formGroup]="form"
            (ngSubmit)="save()"
            novalidate
          >
            <h2 class="h5 mb-0">Today</h2>
            @for (scale of scales; track scale.control) {
              <div>
                <span class="form-label d-block" [id]="'scale-' + scale.control">{{
                  scale.label
                }}</span>
                <div
                  class="btn-group btn-group-sm flex-wrap"
                  role="group"
                  [attr.aria-labelledby]="'scale-' + scale.control"
                >
                  @for (word of scale.words; track word; let i = $index) {
                    <button
                      type="button"
                      class="btn"
                      [class.btn-primary]="form.controls[scale.control].value === i + 1"
                      [class.btn-outline-secondary]="form.controls[scale.control].value !== i + 1"
                      [attr.aria-pressed]="form.controls[scale.control].value === i + 1"
                      (click)="pick(scale.control, i + 1)"
                    >
                      {{ word }}
                    </button>
                  }
                </div>
              </div>
            }
            <div>
              <label class="form-label" for="wellness-notes"
                >A note <span class="text-body-secondary small">(encrypted, optional)</span></label
              >
              <textarea
                id="wellness-notes"
                class="form-control"
                rows="2"
                [class.is-invalid]="notesError()"
                formControlName="notes"
                placeholder="What's weighing on you, or what helped"
              ></textarea>
              @if (notesError(); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div>
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving()">
                Save check-in
              </button>
            </div>
          </form>
        </div>
        <div class="row g-3 mb-3">
          @for (f of averages(); track f.label) {
            <div class="col-4">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">{{ f.label }}</div>
                  <div class="h4 mb-0">{{ f.value }}</div>
                </div>
              </div>
            </div>
          }
        </div>
        <div class="card">
          <div class="card-body">
            <h2 class="h5">The last {{ days }} days</h2>
            @if (logged() === 0) {
              <p class="small text-body-secondary mb-0">
                Check in or give your journal a mood, and the days show up here.
              </p>
            } @else {
              <app-health-trend
                kind="line"
                [labels]="labels()"
                [series]="series()"
                [format]="scaleAxis"
                [range]="[1, 5]"
                [summary]="summary()"
              />
              <p class="small text-body-secondary mt-2 mb-0">
                {{ summary() }} 1 is low, 5 is high on each.
              </p>
            }
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthWellness {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly days = DAYS;
  protected readonly scales = [
    { control: 'stressLevel', label: 'Stress', words: STRESS_WORDS },
    { control: 'energyLevel', label: 'Energy', words: ENERGY_WORDS },
  ] as const;
  protected readonly scaleAxis = (value: number) => (Number.isInteger(value) ? String(value) : '');
  protected readonly data = signal<Wellness | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  protected readonly saving = signal(false);
  private readonly today = todayIso();

  protected readonly form = this.fb.group({
    stressLevel: this.fb.control<number | null>(null),
    energyLevel: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  protected readonly labels = computed(() =>
    (this.data()?.days ?? []).map((d) => formatDate(d.day, APP_DAY_MONTH_FORMAT, this.locale)),
  );
  protected readonly series = computed<TrendSeries[]>(() => {
    const days = this.data()?.days ?? [];
    return [
      { label: 'Mood', values: days.map((d) => d.mood) },
      { label: 'Stress', values: days.map((d) => d.stressLevel) },
      { label: 'Energy', values: days.map((d) => d.energyLevel) },
    ];
  });
  protected readonly logged = computed(
    () =>
      (this.data()?.days ?? []).filter(
        (d) => d.mood !== null || d.stressLevel !== null || d.energyLevel !== null,
      ).length,
  );
  protected readonly averages = computed(() => {
    const d = this.data();
    const show = (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : `${value} / 5`;
    return [
      { label: 'Mood', value: show(d?.averageMood) },
      { label: 'Stress', value: show(d?.averageStress) },
      { label: 'Energy', value: show(d?.averageEnergy) },
    ];
  });
  protected readonly summary = computed(() => {
    const d = this.data();
    return d
      ? `Averages over ${this.logged()} days with something logged: mood ${d.averageMood ?? '—'}, stress ${d.averageStress ?? '—'}, energy ${d.averageEnergy ?? '—'}.`
      : '';
  });

  constructor() {
    this.load();
  }

  protected notesError(): string | null {
    const control = this.form.controls.notes;
    return control.touched && control.errors ? 'Keep it under 4,000 characters.' : null;
  }

  protected pick(control: 'stressLevel' | 'energyLevel', value: number): void {
    const c = this.form.controls[control];
    c.setValue(c.value === value ? null : value);
  }

  protected load(): void {
    this.healthService
      .wellness(addDaysIso(this.today, -(DAYS - 1)), this.today, this.today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadFailed.set(null);
          this.form.reset({
            stressLevel: data.today?.stressLevel ?? null,
            energyLevel: data.today?.energyLevel ?? null,
            notes: data.today?.notes ?? '',
          });
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your check-ins.",
          ),
      });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.healthService
      .saveCheckIn(this.today, { ...v, notes: v.notes.trim() || null, today: this.today })
      .subscribe({
        next: (checkIn) => {
          this.saving.set(false);
          this.toast.success(checkIn ? 'Check-in saved.' : 'Check-in cleared.');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the check-in.'));
        },
      });
  }
}
