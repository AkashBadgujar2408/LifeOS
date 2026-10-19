import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DAY_MONTH_FORMAT, APP_TIME_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import {
  HealthLockedError,
  HealthService,
  SleepRecord,
  SleepSummary,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend } from './health-trend';
import { durationText, nightSeries } from './health-view';
import { openSleepEditor } from './sleep-editor';

const DAYS = 30;
const QUALITY = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];

/** Sleep: the last 30 nights (hours per night, naps left out), the 7- and 30-day averages, and every record. */
@Component({
  selector: 'app-health-sleep',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Sleep</h1>
          <p class="text-body-secondary mb-0 small">
            Each night counts for the morning you woke up.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Log sleep
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="row g-3 mb-3">
          <div class="col-6 col-md-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Average, last 7 days</div>
                <div class="h4 mb-0">
                  {{ d.average7Minutes !== null ? duration(d.average7Minutes) : '—' }}
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Average, last 30 days</div>
                <div class="h4 mb-0">
                  {{ d.average30Minutes !== null ? duration(d.average30Minutes) : '—' }}
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">How it felt, 30 days</div>
                <div class="h4 mb-0">
                  {{ d.averageQuality30 !== null ? d.averageQuality30 + ' / 5' : '—' }}
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Nights logged, 30 days</div>
                <div class="h4 mb-0">{{ d.nightsLogged30 }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-body">
            <h2 class="h5">Hours a night</h2>
            @if (d.nights.length === 0) {
              <p class="small text-body-secondary mb-0">No nights in the last 30 days yet.</p>
            } @else {
              <app-health-trend
                [labels]="labels()"
                [series]="series()"
                [format]="hoursAxis"
                [summary]="summary()"
              />
              <p class="small text-body-secondary mt-2 mb-1">{{ summary() }}</p>
              <details class="small">
                <summary>Show as a table</summary>
                <table class="table table-sm mt-2 mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Morning</th>
                      <th scope="col" class="text-end">Slept</th>
                      <th scope="col" class="text-end">Felt</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (n of d.nights; track n.wokeOn) {
                      <tr>
                        <td>{{ n.wokeOn | date }}</td>
                        <td class="text-end">{{ duration(n.minutes) }}</td>
                        <td class="text-end">{{ n.quality ? quality[n.quality - 1] : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </details>
            }
          </div>
        </div>
        @if (d.records.length) {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (r of d.records; track r.id) {
                <li class="list-group-item d-flex gap-3 align-items-start">
                  <i
                    class="bi {{ r.isNap ? 'bi-cup-hot' : 'bi-moon-stars' }} mt-1"
                    aria-hidden="true"
                  ></i>
                  <div class="min-w-0 flex-grow-1">
                    <button
                      type="button"
                      class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start"
                      (click)="edit(r)"
                    >
                      {{ duration(r.minutes) }}{{ r.isNap ? ' nap' : '' }}
                    </button>
                    <div class="small text-body-secondary">
                      {{ r.wokeOn | date }} · {{ r.startedAt | date: timeFormat }} –
                      {{ r.endedAt | date: timeFormat }}
                      @if (r.quality) {
                        · {{ quality[r.quality - 1] }}
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
export class HealthSleep {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly duration = durationText;
  protected readonly quality = QUALITY;
  protected readonly timeFormat = APP_TIME_FORMAT;
  protected readonly hoursAxis = (minutes: number) => durationText(Math.round(minutes));
  protected readonly data = signal<SleepSummary | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  private readonly today = todayIso();
  private readonly from = addDaysIso(this.today, -(DAYS - 1));

  private readonly days = computed(() =>
    nightSeries(this.data()?.nights ?? [], this.from, this.today),
  );
  protected readonly labels = computed(() =>
    this.days().map((d) => formatDate(d.day, APP_DAY_MONTH_FORMAT, this.locale)),
  );
  protected readonly series = computed(() => [
    { label: 'Slept', values: this.days().map((d) => d.minutes) },
  ]);
  protected readonly summary = computed(() => {
    const d = this.data();
    if (!d || d.nights.length === 0) {
      return '';
    }
    const shortest = d.nights.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    const longest = d.nights.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return `${d.nights.length} nights logged in the last ${DAYS} days, from ${durationText(shortest.minutes)} to ${durationText(longest.minutes)}.`;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .sleep(this.from, this.today, this.today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your sleep.",
          ),
      });
  }

  protected async edit(record?: SleepRecord): Promise<void> {
    if (await openSleepEditor(this.modal, record)) {
      this.load();
      this.toast.success('Saved.');
    }
  }
}
