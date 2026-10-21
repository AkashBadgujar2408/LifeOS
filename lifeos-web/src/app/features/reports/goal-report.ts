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
  GoalReport as GoalReportModel,
  GoalReportArea,
  GoalReportItem,
  ReportsService,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { readRange } from './report-range';
import { GOAL_OUTCOME_LABELS, daysText, percentText } from './report-view';

/**
 * The goal achievement report (Session 90): what the range said about each goal — completed on time or late, missed,
 * abandoned, still going (with deadlines pushed back and goals started counted alongside) — overall, by life area and
 * goal by goal. One outcome per goal, decided by the API's GoalReport, so the counts always add up.
 */
@Component({
  selector: 'app-goal-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError],
  template: `
    <h2 class="d-none d-print-block h5">Goals</h2>
    @if (hidden().has('Goals')) {
      <p class="text-body-secondary">
        Goals are switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the goal report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (r.goals.length === 0) {
        <p class="text-body-secondary">
          Nothing happened to a goal in this range — none completed, missed, abandoned or started.
          Try a longer range.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Completed</div>
                <div class="h4 mb-0">{{ r.totals.completed }}</div>
                <div class="small text-body-secondary">
                  {{ r.totals.onTime }} on time · {{ r.totals.late }} late
                  @if (r.totals.noTarget) {
                    · {{ r.totals.noTarget }} undated
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">On time</div>
                <div class="h4 mb-0">{{ percent(r.totals.onTimePercent) }}</div>
                <div class="small text-body-secondary">of completed goals with a date</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Missed</div>
                <div class="h4 mb-0">{{ r.totals.missed }}</div>
                <div class="small text-body-secondary">target date passed, not done by then</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Abandoned</div>
                <div class="h4 mb-0">{{ r.totals.abandoned }}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Deadlines pushed back</div>
                <div class="h4 mb-0">{{ r.totals.pushedBack }}</div>
                <div class="small text-body-secondary">{{ r.totals.started }} goals started</div>
              </div>
            </div>
          </div>
        </div>

        <section class="mb-4" aria-labelledby="goal-report-areas">
          <h3 id="goal-report-areas" class="h6">By life area</h3>
          <app-data-grid
            name="report-goals-by-area"
            [rows]="r.areas"
            [columns]="areaColumns"
            [phoneColumns]="['lifeAreaName', 'completed', 'onTimePercent']"
            [rowId]="areaId"
            [noun]="['life area', 'life areas']"
            [clickable]="false"
          />
        </section>

        <section aria-labelledby="goal-report-goals">
          <h3 id="goal-report-goals" class="h6">Goal by goal</h3>
          <app-data-grid
            name="report-goals"
            [rows]="r.goals"
            [columns]="goalColumns"
            [phoneColumns]="['title', 'outcome']"
            [rowId]="goalId"
            [noun]="['goal', 'goals']"
            (open)="openGoal($event)"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the goal report...</p>
    }
  `,
})
export class GoalReport {
  private readonly reportsService = inject(ReportsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly percent = percentText;
  protected readonly report = signal<GoalReportModel | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  protected readonly areaId = (a: GoalReportArea) => a.lifeAreaId;
  protected readonly goalId = (g: GoalReportItem) => g.id;

  private readonly count = (
    headerName: string,
    field: keyof GoalReportArea,
  ): ColDef<GoalReportArea> => ({
    headerName,
    field,
    width: 130,
    type: 'rightAligned',
  });
  protected readonly areaColumns: ColDef<GoalReportArea>[] = [
    { headerName: 'Life area', field: 'lifeAreaName', flex: 1, minWidth: 140 },
    this.count('Completed', 'completed'),
    this.count('On time', 'onTime'),
    this.count('Late', 'late'),
    this.count('Missed', 'missed'),
    this.count('Abandoned', 'abandoned'),
    this.count('Still going', 'inProgress'),
    this.count('Pushed back', 'pushedBack'),
    this.count('Started', 'started'),
    {
      headerName: 'On-time rate',
      field: 'onTimePercent',
      width: 125,
      type: 'rightAligned',
      valueFormatter: (p) => percentText((p.value as number | null) ?? null),
      context: {
        csv: (row: GoalReportArea) => (row.onTimePercent === null ? '' : String(row.onTimePercent)),
      },
    },
  ];

  protected readonly goalColumns: ColDef<GoalReportItem>[] = [
    { headerName: 'Goal', field: 'title', flex: 2, minWidth: 180 },
    { headerName: 'Life area', field: 'lifeAreaName', width: 140 },
    {
      headerName: 'Outcome',
      field: 'outcome',
      width: 210,
      valueFormatter: (p) => (p.data ? GOAL_OUTCOME_LABELS[p.data.outcome] : ''),
    },
    {
      headerName: 'Target date',
      field: 'targetDate',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Completed / abandoned',
      colId: 'endedOn',
      width: 175,
      valueGetter: (p) => p.data?.completedOn ?? p.data?.abandonedOn ?? null,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Days late',
      field: 'daysLate',
      width: 115,
      type: 'rightAligned',
      valueFormatter: (p) =>
        p.value === null || p.value === undefined ? '' : daysText(p.value as number),
      context: {
        csv: (row: GoalReportItem) => (row.daysLate === null ? '' : String(row.daysLate)),
      },
    },
    {
      headerName: 'Pushed back',
      field: 'pushedBack',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => ((p.value as number) ? `${p.value}×` : ''),
      context: { csv: (row: GoalReportItem) => String(row.pushedBack) },
    },
    {
      headerName: 'Started',
      field: 'startedOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
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
      .goals(range)
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

  protected openGoal(goal: GoalReportItem): void {
    void this.router.navigate(['/goals', goal.id]);
  }
}
