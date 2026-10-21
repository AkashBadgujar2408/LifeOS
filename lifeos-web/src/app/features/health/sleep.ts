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
import { ColDef } from 'ag-grid-community';
import { APP_DAY_MONTH_FORMAT, APP_TIME_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
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
/** Every record of the last year is listed; the grid pages it. */
const LIST_DAYS = 365;
const QUALITY = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];

/** Sleep: the last 30 nights (hours per night, naps left out), the 7- and 30-day averages, and a year of records. */
@Component({
  selector: 'app-health-sleep',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, HealthTrend, DataGrid],
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
            @if (chartNights().length === 0) {
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
                    @for (n of chartNights(); track n.wokeOn) {
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
          <h2 class="h6 text-body-secondary text-uppercase small mt-3">Last 12 months</h2>
          <app-data-grid
            name="sleep"
            [rows]="d.records"
            [columns]="columns"
            [phoneColumns]="['wokeOn', 'minutes', 'quality']"
            [rowId]="rowId"
            [noun]="['record', 'records']"
            [beforeExport]="exportGuard"
            (open)="edit($event)"
          />
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
  protected readonly rowId = (r: SleepRecord) => r.id;
  protected readonly exportGuard = this.healthService.exportGuard('sleep');
  protected readonly columns: ColDef<SleepRecord>[] = [
    {
      headerName: 'Morning',
      field: 'wokeOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      // Same morning: the later sleep first, as the server sends them.
      comparator: (a: string, b: string, nodeA, nodeB) =>
        a === b
          ? (nodeA.data?.startedAt ?? '').localeCompare(nodeB.data?.startedAt ?? '')
          : a < b
            ? -1
            : 1,
    },
    {
      headerName: 'Slept',
      field: 'minutes',
      width: 105,
      type: 'rightAligned',
      valueFormatter: (p) =>
        p.data ? durationText(p.data.minutes) + (p.data.isNap ? ' nap' : '') : '',
    },
    {
      headerName: 'Felt',
      field: 'quality',
      width: 100,
      valueFormatter: (p) => (p.value ? QUALITY[(p.value as number) - 1] : ''),
    },
    {
      headerName: 'From',
      field: 'startedAt',
      width: 105,
      valueFormatter: (p) =>
        p.value ? formatDate(p.value as string, APP_TIME_FORMAT, this.locale) : '',
    },
    {
      headerName: 'To',
      field: 'endedAt',
      width: 105,
      valueFormatter: (p) =>
        p.value ? formatDate(p.value as string, APP_TIME_FORMAT, this.locale) : '',
    },
    { headerName: 'Nap', field: 'isNap', width: 80, valueFormatter: (p) => (p.value ? 'Nap' : '') },
    { headerName: 'Notes', field: 'notes', flex: 1, minWidth: 160 },
  ];
  protected readonly hoursAxis = (minutes: number) => durationText(Math.round(minutes));
  protected readonly data = signal<SleepSummary | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  private readonly today = todayIso();
  private readonly from = addDaysIso(this.today, -(DAYS - 1));
  private readonly listFrom = addDaysIso(this.today, -(LIST_DAYS - 1));

  /** The chart's nights: the last 30 days (the records list covers a year). */
  protected readonly chartNights = computed(() =>
    (this.data()?.nights ?? []).filter((n) => n.wokeOn >= this.from),
  );
  private readonly days = computed(() => nightSeries(this.chartNights(), this.from, this.today));
  protected readonly labels = computed(() =>
    this.days().map((d) => formatDate(d.day, APP_DAY_MONTH_FORMAT, this.locale)),
  );
  protected readonly series = computed(() => [
    { label: 'Slept', values: this.days().map((d) => d.minutes) },
  ]);
  protected readonly summary = computed(() => {
    const nights = this.chartNights();
    if (nights.length === 0) {
      return '';
    }
    const shortest = nights.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    const longest = nights.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return `${nights.length} nights logged in the last ${DAYS} days, from ${durationText(shortest.minutes)} to ${durationText(longest.minutes)}.`;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .sleep(this.listFrom, this.today, this.today)
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
