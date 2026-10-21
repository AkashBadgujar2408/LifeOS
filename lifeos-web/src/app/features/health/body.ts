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
import { forkJoin } from 'rxjs';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import {
  HealthLockedError,
  HealthService,
  MEASUREMENT_KINDS,
  Measurement,
  MeasurementKind,
  MeasurementLatest,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend, TrendSeries } from './health-trend';
import { MEASUREMENTS, changeText, measurementText } from './health-view';
import { openMeasurementEditor } from './measurement-editor';

/** Body measurements: the latest of each kind with its change, and one kind's history as a line. */
@Component({
  selector: 'app-health-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, HealthTrend, DataGrid],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Body</h1>
          <p class="text-body-secondary mb-0 small">Weight, measurements and readings over time.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit(undefined)">
          <i class="bi bi-plus-lg"></i> Add a measurement
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (latest(); as latest) {
        @if (latest.length === 0) {
          <p class="text-body-secondary">
            Nothing measured yet. Start with your weight — the trend appears after two.
          </p>
        } @else {
          <div class="row g-3 mb-3">
            @for (l of latest; track l.kind) {
              <div class="col-6 col-md-4 col-lg-3">
                <button
                  type="button"
                  class="card h-100 w-100 text-start bg-transparent"
                  [class.border-primary]="l.kind === kind()"
                  [attr.aria-pressed]="l.kind === kind()"
                  (click)="pick(l.kind)"
                >
                  <span class="card-body d-block">
                    <span class="small text-body-secondary d-block">{{ info[l.kind].label }}</span>
                    <span class="h5 mb-0 d-block">{{ text(l.latest) }}</span>
                    <span class="small text-body-secondary d-block">
                      {{ l.latest.measuredOn | date }}
                      @if (l.change !== null) {
                        · {{ change(l.change, l.kind) }}
                      }
                    </span>
                  </span>
                </button>
              </div>
            }
          </div>
          <div class="card">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <h2 class="h5 mb-0">{{ info[kind()].label }} over time</h2>
                <select
                  class="form-select form-select-sm w-auto"
                  aria-label="Measure to show"
                  [value]="kind()"
                  (change)="pick($any($event.target).value)"
                >
                  @for (k of kinds; track k) {
                    <option [value]="k" [selected]="k === kind()">{{ info[k].label }}</option>
                  }
                </select>
              </div>
              @if (history().length < 2) {
                <p class="small text-body-secondary mb-0">
                  {{
                    history().length === 0
                      ? 'None recorded yet.'
                      : 'One so far — the line starts with the second.'
                  }}
                </p>
              } @else {
                <app-health-trend
                  kind="line"
                  [labels]="labels()"
                  [series]="series()"
                  [format]="axis()"
                  [fromZero]="false"
                  [summary]="summary()"
                />
                <p class="small text-body-secondary mt-2 mb-1">{{ summary() }}</p>
              }
              @if (history().length) {
                <h3 class="h6 text-body-secondary text-uppercase small mt-3">All readings</h3>
                <app-data-grid
                  name="measurements"
                  [rows]="history()"
                  [columns]="columns"
                  [phoneColumns]="['measuredOn', 'value']"
                  [rowId]="rowId"
                  [noun]="['reading', 'readings']"
                  [beforeExport]="exportGuard"
                  (open)="edit($event)"
                />
              }
            </div>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthBody {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly kinds = MEASUREMENT_KINDS;
  protected readonly info = MEASUREMENTS;
  protected readonly text = measurementText;
  protected readonly change = changeText;
  protected readonly latest = signal<MeasurementLatest[] | null>(null);
  protected readonly history = signal<Measurement[]>([]);
  protected readonly kind = signal<MeasurementKind>('Weight');
  protected readonly loadFailed = signal<string | null>(null);

  protected readonly rowId = (m: Measurement) => m.id;
  protected readonly exportGuard = this.healthService.exportGuard('measurements');
  protected readonly columns: ColDef<Measurement>[] = [
    {
      headerName: 'Day',
      field: 'measuredOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Measure',
      field: 'kind',
      width: 150,
      valueFormatter: (p) => (p.value ? MEASUREMENTS[p.value as MeasurementKind].label : ''),
    },
    {
      headerName: 'Reading',
      field: 'value',
      width: 140,
      type: 'rightAligned',
      valueFormatter: (p) => (p.data ? measurementText(p.data) : ''),
    },
    { headerName: 'Notes', field: 'notes', flex: 1, minWidth: 160 },
  ];
  protected readonly labels = computed(() =>
    this.history().map((m) => formatDate(m.measuredOn, APP_DAY_MONTH_FORMAT, this.locale)),
  );
  protected readonly series = computed<TrendSeries[]>(() =>
    this.kind() === 'BloodPressure'
      ? [
          { label: 'Systolic', values: this.history().map((m) => m.value) },
          { label: 'Diastolic', values: this.history().map((m) => m.value2) },
        ]
      : [{ label: this.info[this.kind()].label, values: this.history().map((m) => m.value) }],
  );
  protected readonly axis = computed(() => {
    const unit = this.info[this.kind()].unit;
    return (value: number) => (unit === '%' ? `${value}%` : `${value} ${unit}`);
  });
  protected readonly summary = computed(() => {
    const h = this.history();
    if (h.length < 2) {
      return '';
    }
    const first = h[0];
    const last = h[h.length - 1];
    return `${h.length} readings from ${formatDate(first.measuredOn, APP_DAY_MONTH_FORMAT, this.locale)}: ${measurementText(first)} then, ${measurementText(last)} now.`;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    forkJoin({
      latest: this.healthService.latestMeasurements(),
      history: this.healthService.measurements(this.kind()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ latest, history }) => {
          this.latest.set(latest);
          this.history.set(history);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your measurements.",
          ),
      });
  }

  protected pick(kind: MeasurementKind): void {
    this.kind.set(kind);
    this.healthService.measurements(kind).subscribe({
      next: (history) => this.history.set(history),
      error: () => this.history.set([]),
    });
  }

  protected async edit(measurement: Measurement | undefined): Promise<void> {
    if (await openMeasurementEditor(this.modal, measurement, this.kind())) {
      this.load();
      this.toast.success('Saved.');
    }
  }
}
