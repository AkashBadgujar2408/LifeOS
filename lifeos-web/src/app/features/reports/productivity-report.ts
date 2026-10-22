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
import { formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import {
  ProductivityReport as ProductivityReportModel,
  ProductivityWeek,
  ReportsService,
  TaskReportItem,
  TimeByArea,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { EntityOpener } from '../search/entity-opener';
import { readRange } from './report-range';
import { TASK_OUTCOME_LABELS, daysText, hours, percentText } from './report-view';

/** "1h 30m", or blank for nothing (grid cells). */
function minutesCell(value: number | null | undefined): string {
  return value ? formatMinutes(value) : '';
}

/**
 * The productivity report (Session 91): tasks done in the range (on time / late / no due date — one outcome per task,
 * decided by the API's ProductivityReport), the overdue rate, estimated vs actual time, focus time week by week, and
 * planned vs tracked time by life area — time blocks on the calendar against focus, study and practice sessions.
 */
@Component({
  selector: 'app-productivity-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">Productivity</h2>
    @if (hidden().has('Tasks')) {
      <p class="text-body-secondary">
        Tasks are switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the productivity report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (empty()) {
        <p class="text-body-secondary">
          Nothing to report in this range — no tasks done or due, no focus sessions, no time blocks
          or tracked time. Try a longer range.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Tasks done</div>
                <div class="h4 mb-0">{{ r.tasks.completed }}</div>
                <div class="small text-body-secondary">
                  {{ r.tasks.onTime }} on time · {{ r.tasks.late }} late
                  @if (r.tasks.noDueDate) {
                    · {{ r.tasks.noDueDate }} undated
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Overdue rate</div>
                <div class="h4 mb-0">{{ percent(r.tasks.overdueRate) }}</div>
                <div class="small text-body-secondary">
                  {{ r.tasks.overdue }} of {{ r.tasks.duePassed }} due dates passed undone
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Actual vs estimate</div>
                <div class="h4 mb-0">{{ percent(r.estimates.actualPercent) }}</div>
                <div class="small text-body-secondary">
                  @if (r.estimates.tasks) {
                    {{ minutes(r.estimates.actualMinutes) || '0m' }} taken,
                    {{ minutes(r.estimates.estimateMinutes) }} estimated ({{ r.estimates.tasks }}
                    {{ r.estimates.tasks === 1 ? 'task' : 'tasks' }})
                  } @else {
                    no done task had an estimate
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Focus time</div>
                <div class="h4 mb-0">{{ minutes(r.focus.minutes) || '0m' }}</div>
                <div class="small text-body-secondary">
                  {{ r.focus.sessions }} sessions on {{ days(r.focus.days) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (r.focus.minutes > 0 && r.weeks.length > 1) {
          <section class="card mb-4" aria-labelledby="productivity-focus">
            <div class="card-body">
              <h3 id="productivity-focus" class="h6">Focus hours, week by week</h3>
              <app-health-trend
                [labels]="weekLabels()"
                [series]="focusSeries()"
                [format]="hoursText"
                [summary]="focusSummary()"
              />
              <p class="small text-body-secondary mt-2 mb-0">{{ focusSummary() }}</p>
            </div>
          </section>
        }

        @if (r.areas.length) {
          <section class="card mb-4" aria-labelledby="productivity-areas">
            <div class="card-body">
              <h3 id="productivity-areas" class="h6 mb-1">Planned vs tracked, by life area</h3>
              <p class="small text-body-secondary">
                Planned = timed calendar events with that life area. Tracked = focus sessions (a
                task's area is the goal it serves), study sessions and hobby practice.
              </p>
              <app-health-trend
                [labels]="areaLabels()"
                [series]="areaSeries()"
                [format]="hoursText"
                [summary]="areaSummary()"
                [height]="220"
              />
              <p class="small text-body-secondary mt-2">
                {{ minutes(totalPlanned()) || '0m' }} planned, {{ minutes(totalTracked()) || '0m' }}
                tracked.
              </p>
              <app-data-grid
                name="report-time-by-area"
                [rows]="r.areas"
                [columns]="areaColumns"
                [phoneColumns]="['lifeAreaName', 'plannedMinutes', 'trackedMinutes']"
                [rowId]="areaId"
                [noun]="['life area', 'life areas']"
                [clickable]="false"
              />
            </div>
          </section>
        }

        @if (r.taskItems.length) {
          <section class="mb-4" aria-labelledby="productivity-tasks">
            <h3 id="productivity-tasks" class="h6">Task by task</h3>
            <app-data-grid
              name="report-tasks"
              [rows]="r.taskItems"
              [columns]="taskColumns"
              [phoneColumns]="['title', 'outcome']"
              [rowId]="taskId"
              [noun]="['task', 'tasks']"
              (open)="openTask($event)"
            />
          </section>
        }

        <section aria-labelledby="productivity-weeks">
          <h3 id="productivity-weeks" class="h6">Weeks</h3>
          <app-data-grid
            name="report-productivity-weeks"
            [rows]="r.weeks"
            [columns]="weekColumns"
            [phoneColumns]="['from', 'tasksDone', 'focusMinutes']"
            [rowId]="weekId"
            [noun]="['week', 'weeks']"
            [clickable]="false"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the productivity report...</p>
    }
  `,
})
export class ProductivityReport {
  private readonly reportsService = inject(ReportsService);
  private readonly opener = inject(EntityOpener);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly percent = percentText;
  protected readonly minutes = minutesCell;
  protected readonly days = daysText;
  protected readonly hoursText = (value: number) => formatMinutes(Math.round(value * 60));
  protected readonly report = signal<ProductivityReportModel | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  protected readonly empty = computed(() => {
    const r = this.report();
    return (
      !!r &&
      r.taskItems.length === 0 &&
      r.focus.sessions === 0 &&
      r.areas.length === 0 &&
      r.tasks.created === 0
    );
  });
  protected readonly weekLabels = computed(
    () =>
      this.report()?.weeks.map((w) => formatDate(w.from, APP_DAY_MONTH_FORMAT, this.locale)) ?? [],
  );
  protected readonly focusSeries = computed<TrendSeries[]>(() => [
    { label: 'Focus', values: this.report()?.weeks.map((w) => hours(w.focusMinutes)) ?? [] },
  ]);
  protected readonly focusSummary = computed(() => {
    const weeks = this.report()?.weeks ?? [];
    const busiest = weeks.reduce<ProductivityWeek | null>(
      (best, w) => (!best || w.focusMinutes > best.focusMinutes ? w : best),
      null,
    );
    if (!busiest || busiest.focusMinutes === 0) {
      return '';
    }
    const total = weeks.reduce((sum, w) => sum + w.focusMinutes, 0);
    return (
      `${formatMinutes(total)} of focus over ${weeks.length} weeks. ` +
      `Busiest: ${formatMinutes(busiest.focusMinutes)} (week of ${formatDate(busiest.from, APP_DAY_MONTH_FORMAT, this.locale)}).`
    );
  });

  protected readonly areaLabels = computed(
    () => this.report()?.areas.map((a) => a.lifeAreaName) ?? [],
  );
  protected readonly areaSeries = computed<TrendSeries[]>(() => {
    const areas = this.report()?.areas ?? [];
    return [
      { label: 'Planned', values: areas.map((a) => hours(a.plannedMinutes)) },
      { label: 'Tracked', values: areas.map((a) => hours(a.trackedMinutes)) },
    ];
  });
  protected readonly totalPlanned = computed(
    () => this.report()?.areas.reduce((sum, a) => sum + a.plannedMinutes, 0) ?? 0,
  );
  protected readonly totalTracked = computed(
    () => this.report()?.areas.reduce((sum, a) => sum + a.trackedMinutes, 0) ?? 0,
  );
  protected readonly areaSummary = computed(() =>
    (this.report()?.areas ?? [])
      .map(
        (a) =>
          `${a.lifeAreaName}: ${formatMinutes(a.plannedMinutes)} planned, ${formatMinutes(a.trackedMinutes)} tracked`,
      )
      .join('. '),
  );

  protected readonly areaId = (a: TimeByArea) => a.lifeAreaId ?? 0;
  protected readonly taskId = (t: TaskReportItem) => t.id;
  protected readonly weekId = (w: ProductivityWeek) => w.weekStart;

  private readonly minutesColumn = (
    headerName: string,
    field: keyof TimeByArea & string,
    width = 120,
  ): ColDef<TimeByArea> => ({
    headerName,
    field,
    width,
    type: 'rightAligned',
    valueFormatter: (p) => minutesCell(p.value as number),
    context: { csv: (row: TimeByArea) => String(row[field] ?? '') },
  });

  protected readonly areaColumns: ColDef<TimeByArea>[] = [
    { headerName: 'Life area', field: 'lifeAreaName', flex: 1, minWidth: 150 },
    this.minutesColumn('Planned', 'plannedMinutes'),
    this.minutesColumn('Tracked', 'trackedMinutes'),
    {
      headerName: 'Difference',
      colId: 'difference',
      width: 130,
      type: 'rightAligned',
      valueGetter: (p) => (p.data ? p.data.trackedMinutes - p.data.plannedMinutes : 0),
      valueFormatter: (p) => {
        const value = p.value as number;
        return value === 0 ? '—' : `${value > 0 ? '+' : '−'}${formatMinutes(Math.abs(value))}`;
      },
      context: { csv: (row: TimeByArea) => String(row.trackedMinutes - row.plannedMinutes) },
    },
    this.minutesColumn('Focus', 'focusMinutes', 110),
    this.minutesColumn('Study', 'studyMinutes', 110),
    this.minutesColumn('Practice', 'practiceMinutes', 110),
  ];

  protected readonly taskColumns: ColDef<TaskReportItem>[] = [
    { headerName: 'Task', field: 'title', flex: 2, minWidth: 180 },
    {
      headerName: 'Outcome',
      field: 'outcome',
      width: 190,
      valueFormatter: (p) => TASK_OUTCOME_LABELS[p.value as TaskReportItem['outcome']] ?? '',
    },
    { headerName: 'Project', field: 'projectName', width: 150 },
    { headerName: 'Life area', field: 'lifeAreaName', width: 140 },
    {
      headerName: 'Due',
      field: 'dueDate',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Done',
      field: 'completedOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Days late',
      field: 'daysLate',
      width: 110,
      type: 'rightAligned',
    },
    {
      headerName: 'Estimate',
      field: 'estimateMinutes',
      width: 115,
      type: 'rightAligned',
      valueFormatter: (p) => minutesCell(p.value as number | null),
      context: { csv: (row: TaskReportItem) => String(row.estimateMinutes ?? '') },
    },
    {
      headerName: 'Actual',
      field: 'actualMinutes',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => minutesCell(p.value as number),
      context: { csv: (row: TaskReportItem) => String(row.actualMinutes) },
    },
  ];

  protected readonly weekColumns: ColDef<ProductivityWeek>[] = [
    {
      headerName: 'Week from',
      field: 'from',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'To', field: 'to', width: 130, valueFormatter: dayFormatter(this.locale) },
    { headerName: 'Tasks done', field: 'tasksDone', width: 130, type: 'rightAligned' },
    {
      headerName: 'Focus',
      field: 'focusMinutes',
      flex: 1,
      minWidth: 110,
      type: 'rightAligned',
      valueFormatter: (p) => minutesCell(p.value as number),
      context: { csv: (row: ProductivityWeek) => String(row.focusMinutes) },
    },
  ];

  constructor() {
    effect(() => {
      this.range();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const range = this.range();
    this.reportsService
      .productivity(range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (range !== this.range()) {
            return; // an older range answered late
          }
          this.report.set(report);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected openTask(task: TaskReportItem): void {
    this.opener.open('Task', task.id);
  }
}
