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
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import {
  LifeBalanceMonth,
  LifeBalanceReport,
  LifeBalanceReportArea,
  ReportsService,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { readRange } from './report-range';
import { averageText } from './report-view';

/**
 * Life balance over time (Session 92): each month's activity score per life area — computed exactly as My Day's life
 * balance card computes it for those days (busiest area that month = 10) — beside the rating you gave that area that
 * month on the Life Areas page. Life areas switched off in Settings are left out.
 */
@Component({
  selector: 'app-balance-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">Life balance</h2>
    @if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the life balance report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (r.months.length === 0) {
        <p class="text-body-secondary">This range hasn't started yet.</p>
      } @else {
        <section class="card mb-4" aria-labelledby="balance-report-chart">
          <div class="card-body">
            <h3 id="balance-report-chart" class="h6 mb-1">
              Activity and your ratings, by life area
            </h3>
            <p class="small text-body-secondary">
              Activity: the average monthly score (0–10, the busiest area each month = 10). Rating:
              the average of the ratings you gave it on
              <a routerLink="/story/life-areas">Life areas</a> (1–10), over the months you rated it.
            </p>
            <app-health-trend
              [labels]="areaLabels()"
              [series]="areaSeries()"
              [range]="[0, 10]"
              [summary]="summary()"
              [height]="220"
            />
            <p class="small text-body-secondary mt-2 mb-0">{{ summary() }}</p>
          </div>
        </section>

        <section class="mb-4" aria-labelledby="balance-report-areas">
          <h3 id="balance-report-areas" class="h6">By life area</h3>
          <app-data-grid
            name="report-balance-areas"
            [rows]="areas()"
            [columns]="areaColumns"
            [phoneColumns]="['lifeAreaName', 'averageScore', 'averageRating']"
            [rowId]="areaId"
            [noun]="['life area', 'life areas']"
            [clickable]="false"
          />
        </section>

        <section aria-labelledby="balance-report-months">
          <h3 id="balance-report-months" class="h6 mb-1">Month by month</h3>
          <p class="small text-body-secondary">Each cell: activity score · your rating.</p>
          <app-data-grid
            name="report-balance-months"
            [rows]="r.months"
            [columns]="monthColumns()"
            [rowId]="monthId"
            [noun]="['month', 'months']"
            [clickable]="false"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the life balance report...</p>
    }
  `,
})
export class BalanceReport {
  private readonly reportsService = inject(ReportsService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly report = signal<LifeBalanceReport | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  /** The life areas still switched on. */
  protected readonly areas = computed(() => {
    const hiddenIds = this.settings.hiddenLifeAreaIds();
    return this.report()?.areas.filter((a) => !hiddenIds.has(a.lifeAreaId)) ?? [];
  });
  protected readonly areaLabels = computed(() => this.areas().map((a) => a.lifeAreaName));
  protected readonly areaSeries = computed<TrendSeries[]>(() => [
    { label: 'Activity', values: this.areas().map((a) => a.averageScore) },
    { label: 'Your rating', values: this.areas().map((a) => a.averageRating) },
  ]);
  protected readonly summary = computed(() =>
    this.areas()
      .map(
        (a) =>
          `${a.lifeAreaName}: activity ${averageText(a.averageScore)}, rating ${averageText(a.averageRating)}`,
      )
      .join('. '),
  );

  protected readonly areaId = (a: LifeBalanceReportArea) => a.lifeAreaId;
  protected readonly monthId = (m: LifeBalanceMonth) => m.monthStart;

  protected readonly areaColumns: ColDef<LifeBalanceReportArea>[] = [
    { headerName: 'Life area', field: 'lifeAreaName', flex: 1, minWidth: 150 },
    {
      headerName: 'Activity',
      field: 'averageScore',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => averageText((p.value as number | null) ?? null),
    },
    {
      headerName: 'Rating',
      field: 'averageRating',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => averageText((p.value as number | null) ?? null),
    },
    { headerName: 'Months rated', field: 'monthsRated', width: 140, type: 'rightAligned' },
    { headerName: 'Activity points', field: 'points', width: 150, type: 'rightAligned' },
  ];

  /** A column per visible life area; the cell reads "7.5 · 8" (score · rating, "—" when not rated). */
  protected readonly monthColumns = computed<ColDef<LifeBalanceMonth>[]>(() => [
    {
      headerName: 'Month',
      field: 'monthStart',
      width: 120,
      pinned: 'left',
      valueFormatter: (p) => formatDate(p.value as string, 'MMM yyyy', this.locale),
    },
    ...this.areas().map<ColDef<LifeBalanceMonth>>((area) => {
      const cell = (m: LifeBalanceMonth) => m.areas.find((c) => c.lifeAreaId === area.lifeAreaId);
      return {
        headerName: area.lifeAreaName,
        colId: `area-${area.lifeAreaId}`,
        flex: 1,
        minWidth: 120,
        type: 'rightAligned',
        valueGetter: (p) => {
          const c = p.data ? cell(p.data) : undefined;
          return c ? `${averageText(c.score)} · ${c.rating ?? '—'}` : '';
        },
      };
    }),
  ]);

  constructor() {
    effect(() => {
      this.range();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const range = this.range();
    this.reportsService
      .lifeBalance(range)
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
}
