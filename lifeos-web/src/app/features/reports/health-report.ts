import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe, formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { HealthLockedError, HealthService } from '../../core/services/health.service';
import {
  BodyReport,
  HealthReport as HealthReportModel,
  HealthReportWeek,
  WorkoutKindReport,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { readRange } from './report-range';
import { averageText, daysText, hours } from './report-view';

const BODY_WORDS: Record<string, string> = {
  Weight: 'Weight',
  BodyFat: 'Body fat',
  Waist: 'Waist',
  Chest: 'Chest',
  Hips: 'Hips',
  BloodPressure: 'Blood pressure',
  RestingHeartRate: 'Resting heart rate',
  BloodSugar: 'Blood sugar',
};

/** "120/80" for blood pressure, "80.4" otherwise. */
function reading(value: number, value2: number | null): string {
  return value2 === null ? String(value) : `${value}/${value2}`;
}

/** "+1.2" / "−0.8" / "0". */
function signed(value: number | null): string {
  if (value === null || value === 0) {
    return value === null ? '' : '0';
  }
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value * 100) / 100)}`;
}

/**
 * The health report (Session 91), behind the vault unlock like every Health page (the data comes through
 * HealthService, which asks for it): exercise, sleep per night, stress / energy / mood, and body measurements over
 * the range — counted the way the Health pages count (naps out, unknowns never zero, averages over days with a value).
 */
@Component({
  selector: 'app-health-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">Health</h2>
    @if (hidden().has('Health')) {
      <p class="text-body-secondary">
        Health is switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error [message]="loadFailed()!" (retry)="load()" />
    } @else if (report(); as r) {
      @if (empty()) {
        <p class="text-body-secondary">
          Nothing logged in Health for this range — no workouts, sleep, check-ins or measurements.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Exercise</div>
                <div class="h4 mb-0">{{ minutes(r.workouts.minutes) }}</div>
                <div class="small text-body-secondary">
                  {{ r.workouts.sessions }} workouts on {{ days(r.workouts.activeDays) }}
                  @if (r.workouts.distanceKm !== null) {
                    · {{ r.workouts.distanceKm | number: '1.0-1' }} km
                  }
                  @if (r.workouts.steps !== null) {
                    · {{ r.workouts.steps | number }} steps
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Sleep per night</div>
                <div class="h4 mb-0">
                  {{ r.sleep.averageMinutes === null ? '—' : minutes(r.sleep.averageMinutes) }}
                </div>
                <div class="small text-body-secondary">
                  {{ r.sleep.nights }} nights logged
                  @if (r.sleep.averageQuality !== null) {
                    · quality {{ average(r.sleep.averageQuality) }}/5
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Stress · energy</div>
                <div class="h4 mb-0">
                  {{ average(r.wellbeing.averageStress) }} ·
                  {{ average(r.wellbeing.averageEnergy) }}
                </div>
                <div class="small text-body-secondary">
                  out of 5, {{ r.wellbeing.checkIns }} check-ins
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Mood</div>
                <div class="h4 mb-0">{{ average(r.wellbeing.averageMood) }}</div>
                <div class="small text-body-secondary">
                  out of 5, from {{ r.wellbeing.moodDays }} journal days
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (r.weeks.length > 1) {
          <div class="row g-3 mb-4">
            @if (r.workouts.minutes > 0) {
              <section class="col-12 col-lg-6" aria-labelledby="health-report-exercise">
                <div class="card h-100">
                  <div class="card-body">
                    <h3 id="health-report-exercise" class="h6">Exercise hours per week</h3>
                    <app-health-trend
                      [labels]="weekLabels()"
                      [series]="exerciseSeries()"
                      [format]="hoursText"
                      [summary]="exerciseSummary()"
                    />
                    <p class="small text-body-secondary mt-2 mb-0">{{ exerciseSummary() }}</p>
                  </div>
                </div>
              </section>
            }
            @if (r.sleep.nights > 0) {
              <section class="col-12 col-lg-6" aria-labelledby="health-report-sleep">
                <div class="card h-100">
                  <div class="card-body">
                    <h3 id="health-report-sleep" class="h6">Hours slept per night, by week</h3>
                    <app-health-trend
                      [labels]="weekLabels()"
                      [series]="sleepSeries()"
                      [format]="hoursText"
                      [summary]="sleepSummary()"
                    />
                    <p class="small text-body-secondary mt-2 mb-0">{{ sleepSummary() }}</p>
                  </div>
                </div>
              </section>
            }
            @if (r.wellbeing.checkIns > 0 || r.wellbeing.moodDays > 0) {
              <section class="col-12" aria-labelledby="health-report-wellbeing">
                <div class="card">
                  <div class="card-body">
                    <h3 id="health-report-wellbeing" class="h6">Stress, energy and mood (1–5)</h3>
                    <app-health-trend
                      kind="line"
                      [labels]="weekLabels()"
                      [series]="wellbeingSeries()"
                      [range]="[1, 5]"
                      [summary]="wellbeingSummary()"
                    />
                    <p class="small text-body-secondary mt-2 mb-0">{{ wellbeingSummary() }}</p>
                  </div>
                </div>
              </section>
            }
          </div>
        }

        @if (r.body.length) {
          <section class="mb-4" aria-labelledby="health-report-body">
            <h3 id="health-report-body" class="h6">Body</h3>
            <div class="row g-3 mb-3">
              @for (kind of charted(); track kind.kind) {
                <div class="col-12 col-lg-6">
                  <div class="card h-100">
                    <div class="card-body">
                      <h4 class="h6">{{ bodyWord(kind.kind) }} ({{ kind.unit }})</h4>
                      <app-health-trend
                        kind="line"
                        [labels]="bodyLabels(kind)"
                        [series]="bodySeries(kind)"
                        [fromZero]="false"
                        [height]="180"
                        [summary]="bodySummary(kind)"
                      />
                      <p class="small text-body-secondary mt-2 mb-0">{{ bodySummary(kind) }}</p>
                    </div>
                  </div>
                </div>
              }
            </div>
            <app-data-grid
              name="report-health-body"
              [rows]="r.body"
              [columns]="bodyColumns"
              [phoneColumns]="['kind', 'change']"
              [rowId]="bodyId"
              [noun]="['measurement', 'measurements']"
              [clickable]="false"
              [beforeExport]="exportGuard"
            />
          </section>
        }

        @if (r.workouts.kinds.length) {
          <section class="mb-4" aria-labelledby="health-report-kinds">
            <h3 id="health-report-kinds" class="h6">Exercise by kind</h3>
            <app-data-grid
              name="report-health-workouts"
              [rows]="r.workouts.kinds"
              [columns]="kindColumns"
              [phoneColumns]="['kind', 'minutes']"
              [rowId]="kindId"
              [noun]="['kind', 'kinds']"
              [clickable]="false"
              [beforeExport]="exportGuard"
            />
          </section>
        }

        <section aria-labelledby="health-report-weeks">
          <h3 id="health-report-weeks" class="h6">Weeks</h3>
          <app-data-grid
            name="report-health-weeks"
            [rows]="r.weeks"
            [columns]="weekColumns"
            [phoneColumns]="['from', 'workoutMinutes', 'sleepAverageMinutes']"
            [rowId]="weekId"
            [noun]="['week', 'weeks']"
            [clickable]="false"
            [beforeExport]="exportGuard"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the health report...</p>
    }
  `,
})
export class HealthReport {
  private readonly healthService = inject(HealthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly minutes = formatMinutes;
  protected readonly days = daysText;
  protected readonly average = averageText;
  protected readonly hoursText = (value: number) => formatMinutes(Math.round(value * 60));
  protected readonly exportGuard = this.healthService.exportGuard('report');
  protected readonly report = signal<HealthReportModel | null>(null);
  /** The load error's message (locked or failed), or null. */
  protected readonly loadFailed = signal<string | null>(null);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  protected readonly empty = computed(() => {
    const r = this.report();
    return (
      !!r &&
      r.workouts.sessions === 0 &&
      r.sleep.nights === 0 &&
      r.wellbeing.checkIns === 0 &&
      r.wellbeing.moodDays === 0 &&
      r.body.length === 0
    );
  });

  private readonly day = (iso: string) => formatDate(iso, APP_DAY_MONTH_FORMAT, this.locale);
  protected readonly weekLabels = computed(
    () => this.report()?.weeks.map((w) => this.day(w.from)) ?? [],
  );
  protected readonly exerciseSeries = computed<TrendSeries[]>(() => [
    { label: 'Exercise', values: this.report()?.weeks.map((w) => hours(w.workoutMinutes)) ?? [] },
  ]);
  protected readonly sleepSeries = computed<TrendSeries[]>(() => [
    {
      label: 'Sleep per night',
      values: this.report()?.weeks.map((w) => hours(w.sleepAverageMinutes)) ?? [],
    },
  ]);
  protected readonly wellbeingSeries = computed<TrendSeries[]>(() => {
    const weeks = this.report()?.weeks ?? [];
    return [
      { label: 'Stress', values: weeks.map((w) => w.averageStress) },
      { label: 'Energy', values: weeks.map((w) => w.averageEnergy) },
      { label: 'Mood', values: weeks.map((w) => w.averageMood) },
    ];
  });

  protected readonly exerciseSummary = computed(() => {
    const r = this.report();
    if (!r) {
      return '';
    }
    const active = r.weeks.filter((w) => w.workoutMinutes > 0).length;
    return `${formatMinutes(r.workouts.minutes)} of exercise; active in ${active} of ${r.weeks.length} weeks.`;
  });
  protected readonly sleepSummary = computed(() => {
    const r = this.report();
    if (!r || r.sleep.averageMinutes === null) {
      return '';
    }
    return `${formatMinutes(r.sleep.averageMinutes)} a night on average over ${r.sleep.nights} nights logged.`;
  });
  protected readonly wellbeingSummary = computed(() => {
    const w = this.report()?.wellbeing;
    return w
      ? `Average stress ${averageText(w.averageStress)}, energy ${averageText(w.averageEnergy)}, mood ${averageText(w.averageMood)} (out of 5).`
      : '';
  });

  /** Kinds with at least two readings get a line; the table has them all. */
  protected readonly charted = computed(
    () => this.report()?.body.filter((b) => b.readings > 1) ?? [],
  );
  protected readonly bodyWord = (kind: string) => BODY_WORDS[kind] ?? kind;
  protected bodyLabels(kind: BodyReport): string[] {
    return kind.points.map((p) => this.day(p.day));
  }
  protected bodySeries(kind: BodyReport): TrendSeries[] {
    return kind.kind === 'BloodPressure'
      ? [
          { label: 'Systolic', values: kind.points.map((p) => p.value) },
          { label: 'Diastolic', values: kind.points.map((p) => p.value2) },
        ]
      : [{ label: this.bodyWord(kind.kind), values: kind.points.map((p) => p.value) }];
  }
  protected bodySummary(kind: BodyReport): string {
    return (
      `${reading(kind.first, kind.first2)} on ${this.day(kind.firstOn)} → ` +
      `${reading(kind.last, kind.last2)} ${kind.unit} on ${this.day(kind.lastOn)} (${kind.readings} readings).`
    );
  }

  protected readonly bodyId = (b: BodyReport) => b.kind;
  protected readonly kindId = (k: WorkoutKindReport) => k.kind;
  protected readonly weekId = (w: HealthReportWeek) => w.weekStart;

  protected readonly bodyColumns: ColDef<BodyReport>[] = [
    {
      headerName: 'Measurement',
      field: 'kind',
      flex: 1,
      minWidth: 160,
      valueFormatter: (p) => BODY_WORDS[p.value as string] ?? (p.value as string),
    },
    { headerName: 'Unit', field: 'unit', width: 90 },
    { headerName: 'Readings', field: 'readings', width: 110, type: 'rightAligned' },
    {
      headerName: 'First',
      colId: 'first',
      width: 120,
      type: 'rightAligned',
      valueGetter: (p) => (p.data ? reading(p.data.first, p.data.first2) : ''),
    },
    {
      headerName: 'On',
      field: 'firstOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'Latest',
      colId: 'last',
      width: 120,
      type: 'rightAligned',
      valueGetter: (p) => (p.data ? reading(p.data.last, p.data.last2) : ''),
    },
    {
      headerName: 'On',
      field: 'lastOn',
      colId: 'lastOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'Change',
      field: 'change',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) =>
        p.data?.change2 !== null && p.data?.change2 !== undefined
          ? `${signed(p.data.change)}/${signed(p.data.change2)}`
          : signed(p.value as number),
      context: {
        csv: (row: BodyReport) =>
          row.change2 === null ? String(row.change) : `${row.change}/${row.change2}`,
      },
    },
  ];

  protected readonly kindColumns: ColDef<WorkoutKindReport>[] = [
    { headerName: 'Kind', field: 'kind', flex: 1, minWidth: 140 },
    { headerName: 'Workouts', field: 'sessions', width: 120, type: 'rightAligned' },
    {
      headerName: 'Time',
      field: 'minutes',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => formatMinutes(p.value as number),
      context: { csv: (row: WorkoutKindReport) => String(row.minutes) },
    },
    {
      headerName: 'Distance (km)',
      field: 'distanceKm',
      width: 140,
      type: 'rightAligned',
    },
  ];

  protected readonly weekColumns: ColDef<HealthReportWeek>[] = [
    {
      headerName: 'Week from',
      field: 'from',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'Exercise',
      field: 'workoutMinutes',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => ((p.value as number) ? formatMinutes(p.value as number) : '–'),
      context: { csv: (row: HealthReportWeek) => String(row.workoutMinutes) },
    },
    { headerName: 'Nights', field: 'sleepNights', width: 100, type: 'rightAligned' },
    {
      headerName: 'Sleep / night',
      field: 'sleepAverageMinutes',
      width: 135,
      type: 'rightAligned',
      valueFormatter: (p) => (p.value === null ? '–' : formatMinutes(p.value as number)),
      context: { csv: (row: HealthReportWeek) => String(row.sleepAverageMinutes ?? '') },
    },
    {
      headerName: 'Stress',
      field: 'averageStress',
      width: 100,
      type: 'rightAligned',
      valueFormatter: (p) => averageText((p.value as number | null) ?? null),
    },
    {
      headerName: 'Energy',
      field: 'averageEnergy',
      width: 100,
      type: 'rightAligned',
      valueFormatter: (p) => averageText((p.value as number | null) ?? null),
    },
    {
      headerName: 'Mood',
      field: 'averageMood',
      flex: 1,
      minWidth: 90,
      type: 'rightAligned',
      valueFormatter: (p) => averageText((p.value as number | null) ?? null),
    },
  ];

  constructor() {
    effect(() => {
      this.range();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    if (this.hidden().has('Health')) {
      return; // switched off: no unlock prompt for a tab that shows nothing
    }
    const range = this.range();
    this.healthService
      .report(range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (range !== this.range()) {
            return; // an older range answered late
          }
          this.report.set(report);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load the health report.",
          ),
      });
  }
}
