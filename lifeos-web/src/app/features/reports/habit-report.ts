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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import {
  HabitReport as HabitReportModel,
  HabitReportItem,
  HabitReportWeek,
  ReportsService,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HabitTrend } from './habit-trend';
import { readRange } from './report-range';
import { daysText, percentText } from './report-view';

/**
 * The habit consistency report (Session 90): build habits' share of scheduled days done and avoid habits' clean days,
 * week by week and habit by habit, counted exactly as the habit page's "By weekday" does (today only once done;
 * archived habits up to the day they were archived).
 */
@Component({
  selector: 'app-habit-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError, HabitTrend],
  template: `
    <h2 class="d-none d-print-block h5">Habits</h2>
    @if (hidden().has('Habits')) {
      <p class="text-body-secondary">
        Habits are switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the habit report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (r.habits.length === 0) {
        <p class="text-body-secondary">
          No habits had started by the end of this range. <a routerLink="/habits">Start one</a>, and
          its consistency shows up here.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-4">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Build habits kept</div>
                <div class="h4 mb-0">{{ percent(r.build.percent) }}</div>
                <div class="small text-body-secondary">
                  {{ r.build.good }} of {{ r.build.total }} scheduled days done
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-4">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Avoid habits clean</div>
                <div class="h4 mb-0">{{ percent(r.avoid.percent) }}</div>
                <div class="small text-body-secondary">
                  {{ r.avoid.good }} of {{ r.avoid.total }} days without a slip
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 col-lg-4">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Habits counted</div>
                <div class="h4 mb-0">{{ r.habits.length }}</div>
                @if (archivedCount() > 0) {
                  <div class="small text-body-secondary">
                    {{ archivedCount() }} archived — counted up to the day each was archived
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        @if (trendWeeks() > 1) {
          <section class="card mb-4" aria-labelledby="habit-report-trend">
            <div class="card-body">
              <h3 id="habit-report-trend" class="h6">Build habits, week by week</h3>
              <app-habit-trend [weeks]="r.weeks" />
            </div>
          </section>
        }

        <section class="mb-4" aria-labelledby="habit-report-habits">
          <h3 id="habit-report-habits" class="h6">Habit by habit</h3>
          <app-data-grid
            name="report-habits"
            [rows]="r.habits"
            [columns]="habitColumns"
            [phoneColumns]="['title', 'percent']"
            [rowId]="habitId"
            [noun]="['habit', 'habits']"
            (open)="openHabit($event)"
          />
        </section>

        <section aria-labelledby="habit-report-weeks">
          <h3 id="habit-report-weeks" class="h6">Weeks</h3>
          <app-data-grid
            name="report-habit-weeks"
            [rows]="r.weeks"
            [columns]="weekColumns"
            [phoneColumns]="['from', 'percent']"
            [rowId]="weekId"
            [noun]="['week', 'weeks']"
            [clickable]="false"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the habit report...</p>
    }
  `,
})
export class HabitReport {
  private readonly reportsService = inject(ReportsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly percent = percentText;
  protected readonly report = signal<HabitReportModel | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));
  protected readonly archivedCount = computed(
    () => this.report()?.habits.filter((h) => h.status === 'Archived').length ?? 0,
  );
  protected readonly trendWeeks = computed(
    () => this.report()?.weeks.filter((w) => w.percent !== null).length ?? 0,
  );

  protected readonly habitId = (h: HabitReportItem) => h.id;
  protected readonly weekId = (w: HabitReportWeek) => w.weekStart;

  protected readonly habitColumns: ColDef<HabitReportItem>[] = [
    { headerName: 'Habit', field: 'title', flex: 2, minWidth: 170 },
    {
      headerName: 'Kind',
      field: 'kind',
      width: 100,
      valueFormatter: (p) => (p.value === 'Avoid' ? 'Avoid' : 'Build'),
    },
    { headerName: 'Life area', field: 'lifeAreaName', width: 140 },
    {
      headerName: 'Days',
      colId: 'days',
      width: 150,
      valueGetter: (p) => (p.data ? `${p.data.good} of ${p.data.total}` : ''),
      context: { csv: (row: HabitReportItem) => `${row.good}/${row.total}` },
    },
    {
      headerName: 'Consistency',
      field: 'percent',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => percentText((p.value as number | null) ?? null),
      context: { csv: (row: HabitReportItem) => (row.percent === null ? '' : String(row.percent)) },
    },
    {
      headerName: 'Longest run',
      field: 'bestRun',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => ((p.value as number) ? daysText(p.value as number) : ''),
      context: { csv: (row: HabitReportItem) => String(row.bestRun) },
    },
    {
      headerName: 'Slips',
      field: 'slips',
      width: 90,
      type: 'rightAligned',
      valueFormatter: (p) => (p.data?.kind === 'Avoid' ? String(p.value) : ''),
    },
    {
      headerName: 'Archived',
      field: 'archivedOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
  ];

  protected readonly weekColumns: ColDef<HabitReportWeek>[] = [
    {
      headerName: 'Week from',
      field: 'from',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'To',
      field: 'to',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'Scheduled days', field: 'total', width: 150, type: 'rightAligned' },
    { headerName: 'Done', field: 'good', width: 100, type: 'rightAligned' },
    {
      headerName: 'Consistency',
      field: 'percent',
      flex: 1,
      minWidth: 120,
      type: 'rightAligned',
      valueFormatter: (p) => percentText((p.value as number | null) ?? null),
      context: { csv: (row: HabitReportWeek) => (row.percent === null ? '' : String(row.percent)) },
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
      .habits(range)
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

  protected openHabit(habit: HabitReportItem): void {
    void this.router.navigate(['/habits', habit.id]);
  }
}
