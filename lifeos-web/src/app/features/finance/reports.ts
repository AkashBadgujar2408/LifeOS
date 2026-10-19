import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  BarController,
  BarElement,
  CategoryScale,
  ChartConfiguration,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { forkJoin } from 'rxjs';
import { CashFlowReport, FinanceService, NetWorth } from '../../core/services/finance.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney, netWorthChange } from './finance-view';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved when a chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const PERIODS = [6, 12, 24] as const;

/**
 * Money over time: income against spending month by month, how much of the income was kept (savings rate — its own
 * chart, since a % and an amount never share an axis), where the spending went by tag, and the net worth trend. All
 * in the base currency, with the same conversion as the ledger, so a month here matches the ledger's totals for it.
 */
@Component({
  selector: 'app-finance-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective, RouterLink, LoadError, BaseCurrencyPrompt],
  providers: [
    provideCharts({
      registerables: [
        BarController,
        BarElement,
        LineController,
        LineElement,
        PointElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
      ],
    }),
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Reports</h1>
          <p class="text-body-secondary mb-0 small">
            Cash flow, savings rate and net worth over time, in your base currency.
          </p>
        </div>
        <div class="btn-group btn-group-sm" role="group" aria-label="Period">
          @for (p of periods; track p) {
            <button
              type="button"
              class="btn btn-outline-primary"
              [class.active]="months() === p"
              [attr.aria-pressed]="months() === p"
              (click)="setMonths(p)"
            >
              {{ p }} months
            </button>
          }
        </div>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !report()) {
        <app-load-error message="Couldn't load the reports." (retry)="load()" />
      } @else if (report(); as r) {
        @if (r.currency; as currency) {
          <div class="row g-3 mb-4">
            <div class="col-6 col-lg-3">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">Income</div>
                  <div class="h5 mb-0">{{ money(r.total.income, currency) }}</div>
                </div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">Spending</div>
                  <div class="h5 mb-0">{{ money(r.total.spending, currency) }}</div>
                </div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">Kept</div>
                  <div class="h5 mb-0">{{ money(r.total.net, currency) }}</div>
                </div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">Savings rate</div>
                  <div class="h5 mb-0">
                    {{ r.total.savingsRate === null ? '—' : r.total.savingsRate + '%' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          @if (r.total.unconverted > 0) {
            <p class="small text-body-secondary">
              <i class="bi bi-info-circle"></i> {{ r.total.unconverted }}
              {{ r.total.unconverted === 1 ? 'transaction has' : 'transactions have' }} no rate to
              {{ currency }} and {{ r.total.unconverted === 1 ? 'is' : 'are' }} left out.
            </p>
          }

          <section class="card mb-4">
            <div class="card-body">
              <h2 class="h6">Cash flow</h2>
              <p class="visually-hidden">{{ cashFlowSummary() }}</p>
              <div class="chart-box" aria-hidden="true">
                <canvas
                  baseChart
                  type="bar"
                  [data]="cashFlowData()"
                  [options]="cashFlowOptions()"
                ></canvas>
              </div>
            </div>
          </section>

          <div class="row g-4 mb-4">
            <div class="col-lg-6">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6">Savings rate</h2>
                  <p class="small text-body-secondary">
                    The share of each month's income you didn't spend.
                  </p>
                  <div class="chart-box chart-box-sm" aria-hidden="true">
                    <canvas
                      baseChart
                      type="line"
                      [data]="savingsData()"
                      [options]="savingsOptions()"
                    ></canvas>
                  </div>
                </div>
              </section>
            </div>
            <div class="col-lg-6">
              <section class="card h-100">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-baseline">
                    <h2 class="h6">Net worth</h2>
                    <a routerLink="/finance/net-worth" class="small">Details</a>
                  </div>
                  @if (netWorthLine(); as line) {
                    <p class="small text-body-secondary">{{ line }}</p>
                  }
                  <div class="chart-box chart-box-sm" aria-hidden="true">
                    <canvas
                      baseChart
                      type="line"
                      [data]="netWorthData()"
                      [options]="netWorthOptions()"
                    ></canvas>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div class="row g-4">
            <div class="col-lg-5">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6">Where the spending went</h2>
                  @if (tagBars().length === 0) {
                    <p class="small text-body-secondary mb-0">No spending in this period.</p>
                  } @else {
                    <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
                      @for (t of tagBars(); track t.name) {
                        <li>
                          <div class="d-flex justify-content-between small gap-2">
                            <span class="text-truncate min-w-0">{{ t.name }}</span>
                            <span class="text-nowrap">{{ money(t.spent, currency) }}</span>
                          </div>
                          <div class="tag-track">
                            <div
                              class="tag-bar"
                              [class.untagged]="t.untagged"
                              [style.width.%]="t.width"
                            ></div>
                          </div>
                        </li>
                      }
                    </ul>
                    <p class="small text-body-secondary mt-2 mb-0">
                      An expense with two tags counts under both, as in budgets.
                    </p>
                  }
                </div>
              </section>
            </div>
            <div class="col-lg-7">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6">Month by month</h2>
                  <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col" class="text-end">Income</th>
                          <th scope="col" class="text-end">Spending</th>
                          <th scope="col" class="text-end">Kept</th>
                          <th scope="col" class="text-end">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of monthsNewestFirst(); track m.monthStart) {
                          <tr>
                            <th scope="row" class="fw-normal text-nowrap">
                              {{ monthName(m.monthStart) }}
                            </th>
                            <td class="text-end text-nowrap">{{ money(m.income, currency) }}</td>
                            <td class="text-end text-nowrap">{{ money(m.spending, currency) }}</td>
                            <td class="text-end text-nowrap">{{ money(m.net, currency) }}</td>
                            <td class="text-end">
                              {{ m.savingsRate === null ? '—' : m.savingsRate + '%' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
  styles: `
    .chart-box {
      position: relative;
      height: 280px;
    }
    .chart-box-sm {
      height: 200px;
    }
    .tag-track {
      height: 8px;
      border-radius: 4px;
      background: var(--lifeos-canvas);
    }
    .tag-bar {
      height: 100%;
      border-radius: 4px;
      background: var(--lifeos-teal);
    }
    .tag-bar.untagged {
      background: var(--lifeos-series-other);
    }
  `,
})
export class FinanceReports {
  private readonly financeService = inject(FinanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly periods = PERIODS;
  protected readonly money = formatMoney;
  protected readonly months = signal<number>(12);
  protected readonly report = signal<CashFlowReport | null>(null);
  protected readonly worth = signal<NetWorth | null>(null);
  protected readonly loadFailed = signal(false);

  protected readonly monthsNewestFirst = computed(() =>
    [...(this.report()?.months ?? [])].reverse(),
  );

  protected readonly tagBars = computed(() => {
    const r = this.report();
    if (!r) {
      return [];
    }
    const rows = r.tags.map((t) => ({ name: t.tagName, spent: t.spent, untagged: false }));
    if (r.untaggedSpending > 0) {
      rows.push({ name: 'No tag', spent: r.untaggedSpending, untagged: true });
    }
    const max = Math.max(0, ...rows.map((t) => t.spent));
    return rows.map((t) => ({ ...t, width: max > 0 ? (t.spent / max) * 100 : 0 }));
  });

  protected readonly cashFlowSummary = computed(() => {
    const r = this.report();
    return r?.currency
      ? `Over ${r.months.length} months: income ${formatMoney(r.total.income, r.currency)}, spending ${formatMoney(r.total.spending, r.currency)}. The table below has every month.`
      : '';
  });

  protected readonly netWorthLine = computed(() => {
    const w = this.worth();
    const change = netWorthChange(w?.history ?? []);
    if (!w?.currency || !change) {
      return null;
    }
    const word = change.change >= 0 ? 'Up' : 'Down';
    return `${formatMoney(w.net, w.currency)} today · ${word} ${formatMoney(Math.abs(change.change), w.currency)} since a year ago.`;
  });

  protected monthName(monthStart: string): string {
    return formatDate(monthStart, 'MMM yyyy', this.locale);
  }

  private monthLabels(): string[] {
    return (this.report()?.months ?? []).map((m) =>
      formatDate(m.monthStart, 'MMM yy', this.locale),
    );
  }

  protected readonly cashFlowData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const months = this.report()?.months ?? [];
    const surface = token('--lifeos-surface', '#ffffff');
    const bar = (label: string, data: number[], color: string) => ({
      label,
      data,
      backgroundColor: color,
      hoverBackgroundColor: color,
      borderColor: surface,
      borderWidth: { left: 1, right: 1 },
      borderRadius: { topLeft: 4, topRight: 4 },
      borderSkipped: 'bottom' as const,
      maxBarThickness: 18,
    });
    return {
      labels: this.monthLabels(),
      datasets: [
        bar(
          'Income',
          months.map((m) => m.income),
          token('--lifeos-series-1', '#2a78d6'),
        ),
        bar(
          'Spending',
          months.map((m) => m.spending),
          token('--lifeos-series-2', '#eb6834'),
        ),
      ],
    };
  });

  protected readonly cashFlowOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const currency = this.report()?.currency ?? 'INR';
    const base = this.axes(currency, 'money');
    return {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: token('--lifeos-text-secondary', '#5b6b68'),
            font: { family: 'Manrope, sans-serif', size: 12 },
            boxWidth: 10,
            boxHeight: 10,
            useBorderRadius: true,
            borderRadius: 2,
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label} ${formatMoney(Number(item.raw), currency)}`,
            afterBody: (items) => {
              const m = this.report()?.months[items[0]?.dataIndex ?? -1];
              return m
                ? [
                    `Kept ${formatMoney(m.net, currency)}${m.savingsRate === null ? '' : ` (${m.savingsRate}%)`}`,
                  ]
                : [];
            },
          },
        },
      },
    } as ChartConfiguration<'bar'>['options'];
  });

  protected readonly savingsData = computed<ChartConfiguration<'line'>['data']>(() => {
    const months = this.report()?.months ?? [];
    return {
      labels: this.monthLabels(),
      datasets: [
        this.line(
          'Savings rate',
          months.map((m) => m.savingsRate),
          true,
        ),
      ],
    };
  });

  protected readonly savingsOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const base = this.axes(null, 'percent');
    return {
      ...base,
      spanGaps: false,
      plugins: {
        ...base.plugins,
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (item) => (item.raw === null ? 'No income' : `Kept ${item.raw}% of income`),
          },
        },
      },
    } as ChartConfiguration<'line'>['options'];
  });

  protected readonly netWorthData = computed<ChartConfiguration<'line'>['data']>(() => {
    const history = this.worth()?.history ?? [];
    return {
      labels: history.map((p, i) =>
        i === history.length - 1 ? 'Today' : formatDate(p.day, 'MMM yy', this.locale),
      ),
      datasets: [
        this.line(
          'Net worth',
          history.map((p) => p.net),
        ),
      ],
    };
  });

  protected readonly netWorthOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const currency = this.worth()?.currency ?? 'INR';
    const base = this.axes(currency, 'money');
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          displayColors: false,
          callbacks: { label: (item) => `Net worth ${formatMoney(Number(item.raw), currency)}` },
        },
      },
    } as ChartConfiguration<'line'>['options'];
  });

  constructor() {
    this.load();
  }

  protected setMonths(months: number): void {
    if (months !== this.months()) {
      this.months.set(months);
      this.load();
    }
  }

  protected load(): void {
    forkJoin({
      report: this.financeService.cashFlow(this.months()),
      worth: this.financeService.netWorth(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ report, worth }) => {
          this.report.set(report);
          this.worth.set(worth);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  /** A single teal line; months without a value break it, so points are drawn to keep a lone month visible. */
  private line(label: string, data: (number | null)[], points = false) {
    const teal = token('--lifeos-teal', '#159895');
    return {
      label,
      data,
      borderColor: teal,
      borderWidth: 2,
      pointRadius: points ? 3 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: teal,
      pointBorderColor: token('--lifeos-surface', '#ffffff'),
      pointBorderWidth: 2,
      pointHitRadius: 14,
      tension: 0,
    };
  }

  /** Recessive grid and axes shared by every chart here; y in money (compact) or %. */
  private axes(currency: string | null, unit: 'money' | 'percent') {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const compact = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency ?? 'INR',
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'index' as const, intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        y: {
          border: { display: false },
          grid: { color: grid },
          ticks: {
            color: muted,
            font,
            maxTicksLimit: 5,
            callback: (value: string | number) =>
              unit === 'percent' ? `${value}%` : compact.format(Number(value)),
          },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
      },
      plugins: { legend: { display: false } },
    };
  }
}
