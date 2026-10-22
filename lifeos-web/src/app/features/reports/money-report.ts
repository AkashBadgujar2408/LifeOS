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
import { CashFlowMonth } from '../../core/services/finance.service';
import { FinanceReport, ReportsService } from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { readRange } from './report-range';

type TagRow = FinanceReport['tags'][number];

/**
 * The money report (Session 92): the range's cash flow — counted by the same procedure as the Finance reports page,
 * so a month here matches that month there and the ledger — and net worth before → after, in the base currency.
 */
@Component({
  selector: 'app-money-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">Money</h2>
    @if (hidden().has('Finance')) {
      <p class="text-body-secondary">
        Finance is switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the money report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (!r.currency) {
        <p class="text-body-secondary">
          Choose a base currency in <a routerLink="/finance">Finance</a> first — every figure here
          is in it.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Income</div>
                <div class="h4 mb-0">{{ money(r.income) }}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Spending</div>
                <div class="h4 mb-0">{{ money(r.spending) }}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Kept</div>
                <div class="h4 mb-0">{{ money(r.net) }}</div>
                <div class="small text-body-secondary">
                  @if (r.savingsRate !== null) {
                    {{ r.savingsRate }}% of income saved
                  } @else {
                    no income in this range
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Net worth</div>
                @if (r.netWorthEnd && r.netWorthChange !== null) {
                  <div class="h4 mb-0">{{ money(r.netWorthEnd.net) }}</div>
                  <div class="small text-body-secondary">
                    {{ r.netWorthChange >= 0 ? '+' : '' }}{{ money(r.netWorthChange) }} since
                    {{ day(r.netWorthStart!.day) }}
                  </div>
                } @else {
                  <div class="h4 mb-0">—</div>
                  <div class="small text-body-secondary">the range hasn't started yet</div>
                }
              </div>
            </div>
          </div>
        </div>

        @if (r.unconverted > 0) {
          <p class="small text-body-secondary">
            {{ r.unconverted }} transactions aren't counted — they have no exchange rate to
            {{ r.currency }}.
          </p>
        }

        <div class="row g-3 mb-4">
          @if (r.months.length > 1) {
            <section class="col-12 col-lg-7" aria-labelledby="money-report-months">
              <div class="card h-100">
                <div class="card-body">
                  <h3 id="money-report-months" class="h6">Income and spending by month</h3>
                  <app-health-trend
                    [labels]="monthLabels()"
                    [series]="cashSeries()"
                    [format]="moneyText"
                    [summary]="cashSummary()"
                  />
                  <p class="small text-body-secondary mt-2 mb-0">{{ cashSummary() }}</p>
                </div>
              </div>
            </section>
          }
          @if (r.netWorth.length > 2) {
            <section class="col-12 col-lg-5" aria-labelledby="money-report-worth">
              <div class="card h-100">
                <div class="card-body">
                  <h3 id="money-report-worth" class="h6">Net worth</h3>
                  <app-health-trend
                    kind="line"
                    [labels]="worthLabels()"
                    [series]="worthSeries()"
                    [format]="moneyText"
                    [fromZero]="false"
                    [summary]="worthSummary()"
                  />
                  <p class="small text-body-secondary mt-2 mb-0">{{ worthSummary() }}</p>
                </div>
              </div>
            </section>
          }
        </div>

        <section class="mb-4" aria-labelledby="money-report-month-grid">
          <h3 id="money-report-month-grid" class="h6">Months</h3>
          <app-data-grid
            name="report-money-months"
            [rows]="r.months"
            [columns]="monthColumns"
            [phoneColumns]="['monthStart', 'net']"
            [rowId]="monthId"
            [noun]="['month', 'months']"
            [clickable]="false"
          />
        </section>

        @if (r.tags.length || r.untaggedSpending) {
          <section class="mb-3" aria-labelledby="money-report-tags">
            <h3 id="money-report-tags" class="h6">Spending by tag</h3>
            <app-data-grid
              name="report-money-tags"
              [rows]="r.tags"
              [columns]="tagColumns"
              [phoneColumns]="['tagName', 'spent']"
              [rowId]="tagId"
              [noun]="['tag', 'tags']"
              [clickable]="false"
            />
            <p class="small text-body-secondary mt-2 mb-0">
              {{ money(r.untaggedSpending) }} of spending had no tag. An expense with two tags
              counts toward both, as budgets do.
            </p>
          </section>
        }
        <p class="small d-print-none">
          <a routerLink="/finance/reports">Money reports in Finance</a> — the last 12 months and the
          savings rate trend.
        </p>
      }
    } @else {
      <p class="text-body-secondary">Loading the money report...</p>
    }
  `,
})
export class MoneyReport {
  private readonly reportsService = inject(ReportsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly report = signal<FinanceReport | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  protected readonly money = (amount: number) =>
    formatMoney(amount, this.report()?.currency ?? 'XXX');
  protected readonly moneyText = (amount: number) => this.money(amount);
  protected readonly day = (iso: string) => formatDate(iso, APP_DAY_MONTH_FORMAT, this.locale);
  private readonly month = (iso: string) => formatDate(iso, 'MMM yyyy', this.locale);

  protected readonly monthLabels = computed(
    () => this.report()?.months.map((m) => this.month(m.monthStart)) ?? [],
  );
  protected readonly cashSeries = computed<TrendSeries[]>(() => {
    const months = this.report()?.months ?? [];
    return [
      { label: 'Income', values: months.map((m) => m.income) },
      { label: 'Spending', values: months.map((m) => m.spending) },
    ];
  });
  protected readonly cashSummary = computed(() => {
    const r = this.report();
    if (!r?.currency) {
      return '';
    }
    const kept = r.months.filter((m) => m.net > 0).length;
    return `${this.money(r.income)} in, ${this.money(r.spending)} out over ${r.months.length} months; more came in than went out in ${kept}.`;
  });
  protected readonly worthLabels = computed(
    () => this.report()?.netWorth.map((p) => this.day(p.day)) ?? [],
  );
  protected readonly worthSeries = computed<TrendSeries[]>(() => [
    { label: 'Net worth', values: this.report()?.netWorth.map((p) => p.net) ?? [] },
  ]);
  protected readonly worthSummary = computed(() => {
    const r = this.report();
    if (!r?.netWorthStart || !r.netWorthEnd) {
      return '';
    }
    return `${this.money(r.netWorthStart.net)} on ${this.day(r.netWorthStart.day)} → ${this.money(r.netWorthEnd.net)} on ${this.day(r.netWorthEnd.day)}.`;
  });

  protected readonly monthId = (m: CashFlowMonth) => m.monthStart;
  protected readonly tagId = (t: TagRow) => t.tagId;

  private moneyColumn<T>(headerName: string, field: string, width = 140): ColDef<T> {
    return {
      headerName,
      field: field as ColDef<T>['field'],
      width,
      type: 'rightAligned',
      valueFormatter: (p) => this.money(p.value as number),
      context: { csv: (row: Record<string, number>) => String(row[field]) },
    };
  }

  protected readonly monthColumns: ColDef<CashFlowMonth>[] = [
    {
      headerName: 'Month',
      field: 'monthStart',
      flex: 1,
      minWidth: 120,
      valueFormatter: (p) => this.month(p.value as string),
    },
    this.moneyColumn<CashFlowMonth>('Income', 'income'),
    this.moneyColumn<CashFlowMonth>('Spending', 'spending'),
    this.moneyColumn<CashFlowMonth>('Kept', 'net'),
    {
      headerName: 'Saved',
      field: 'savingsRate',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => (p.value === null ? '—' : `${p.value}%`),
    },
  ];

  protected readonly tagColumns: ColDef<TagRow>[] = [
    { headerName: 'Tag', field: 'tagName', flex: 1, minWidth: 140 },
    this.moneyColumn<TagRow>('Spent', 'spent'),
    { headerName: 'Expenses', field: 'transactionCount', width: 120, type: 'rightAligned' },
  ];

  constructor() {
    effect(() => {
      this.range();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    if (this.hidden().has('Finance')) {
      return;
    }
    const range = this.range();
    this.reportsService
      .finance(range)
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
