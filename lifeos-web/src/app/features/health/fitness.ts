import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import {
  Fitness,
  HealthLockedError,
  HealthService,
  Workout,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend } from './health-trend';
import { WORKOUT_KIND_ICONS, WORKOUT_KIND_LABELS, durationText } from './health-view';
import { openWorkoutEditor } from './workout-editor';

const WEEKS = 12;

/** Exercise: minutes a week for the last twelve weeks, this week's figures, and the last 60 days of workouts. */
@Component({
  selector: 'app-health-fitness',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Exercise</h1>
          <p class="text-body-secondary mb-0 small">
            Walks, runs, workouts — minutes add up by week (Monday to Sunday).
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Log exercise
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="row g-3 mb-3">
          @for (f of figures(); track f.label) {
            <div class="col-6 col-md-3">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">{{ f.label }}</div>
                  <div class="h4 mb-0">{{ f.value }}</div>
                </div>
              </div>
            </div>
          }
        </div>
        <div class="card mb-3">
          <div class="card-body">
            <h2 class="h5">Minutes a week</h2>
            <app-health-trend
              [labels]="weekLabels()"
              [series]="weekSeries()"
              [format]="minutesAxis"
              [summary]="weekSummary()"
            />
            <p class="small text-body-secondary mt-2 mb-1">{{ weekSummary() }}</p>
            <details class="small">
              <summary>Show as a table</summary>
              <table class="table table-sm mt-2 mb-0">
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    <th scope="col" class="text-end">Minutes</th>
                    <th scope="col" class="text-end">Sessions</th>
                    <th scope="col" class="text-end">Steps</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of d.weeks; track w.weekStart) {
                    <tr>
                      <td>{{ w.weekStart | date }}</td>
                      <td class="text-end">{{ w.minutes }}</td>
                      <td class="text-end">{{ w.sessions }}</td>
                      <td class="text-end">{{ w.steps | number }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          </div>
        </div>
        <h2 class="h6 text-body-secondary text-uppercase small mt-3">Last 60 days</h2>
        @if (d.workouts.length === 0) {
          <p class="text-body-secondary">Nothing logged yet. A ten-minute walk counts.</p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (w of d.workouts; track w.id) {
                <li class="list-group-item d-flex gap-3 align-items-start">
                  <i class="bi {{ icons[w.kind] }} mt-1" aria-hidden="true"></i>
                  <div class="min-w-0 flex-grow-1">
                    <button
                      type="button"
                      class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start"
                      (click)="edit(w)"
                    >
                      {{ labels[w.kind] }} · {{ duration(w.minutes) }}
                    </button>
                    <div class="small text-body-secondary">
                      {{ w.occurredOn | date }}
                      @if (w.steps !== null) {
                        · {{ w.steps | number }} steps
                      }
                      @if (w.distanceKm !== null) {
                        · {{ w.distanceKm }} km
                      }
                      @if (w.calories !== null) {
                        · {{ w.calories }} kcal
                      }
                      @if (w.intensity) {
                        · {{ w.intensity }}
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthFitness {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly labels = WORKOUT_KIND_LABELS;
  protected readonly icons = WORKOUT_KIND_ICONS;
  protected readonly duration = durationText;
  protected readonly minutesAxis = (value: number) => `${value} min`;
  protected readonly data = signal<Fitness | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  private readonly today = todayIso();

  protected readonly weekLabels = computed(() =>
    (this.data()?.weeks ?? []).map((w) =>
      formatDate(w.weekStart, APP_DAY_MONTH_FORMAT, this.locale),
    ),
  );
  protected readonly weekSeries = computed(() => [
    { label: 'Minutes', values: (this.data()?.weeks ?? []).map((w) => w.minutes) },
  ]);

  protected readonly figures = computed(() => {
    const weeks = this.data()?.weeks ?? [];
    const thisWeek = weeks.at(-1);
    const earlier = weeks.slice(0, -1);
    const average = earlier.length
      ? Math.round(earlier.reduce((sum, w) => sum + w.minutes, 0) / earlier.length)
      : 0;
    return [
      { label: 'This week', value: durationText(thisWeek?.minutes ?? 0) },
      { label: 'Sessions this week', value: String(thisWeek?.sessions ?? 0) },
      { label: `Average, previous ${earlier.length} weeks`, value: durationText(average) },
      { label: 'Steps this week', value: formatNumber(thisWeek?.steps ?? 0, this.locale) },
    ];
  });

  protected readonly weekSummary = computed(() => {
    const weeks = this.data()?.weeks ?? [];
    const active = weeks.filter((w) => w.minutes > 0);
    if (active.length === 0) {
      return `No exercise logged in the last ${WEEKS} weeks.`;
    }
    const best = active.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return `${active.length} of ${weeks.length} weeks with exercise; the most was ${durationText(best.minutes)} in the week of ${formatDate(best.weekStart, APP_DAY_MONTH_FORMAT, this.locale)}.`;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .fitness(addDaysIso(this.today, -59), this.today, this.today, WEEKS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your exercise.",
          ),
      });
  }

  protected async edit(workout?: Workout): Promise<void> {
    if (await openWorkoutEditor(this.modal, workout)) {
      this.load();
      this.toast.success('Saved.');
    }
  }
}
