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
import { RouterLink } from '@angular/router';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  CategoryScale,
  ChartConfiguration,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { FinanceService, NetWorth, WealthItem } from '../../core/services/finance.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney, netWorthChange } from './finance-view';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const GROUPS: { type: WealthItem['type']; label: string; link: string }[] = [
  { type: 'FinanceAccount', label: 'Accounts', link: '/finance' },
  { type: 'Holding', label: 'Investments', link: '/finance/investments' },
  { type: 'Loan', label: 'Loans', link: '/finance/loans' },
];

/**
 * Net worth = what you own − what you owe, in the base currency, today and at each of the last 12 month ends (all
 * rebuilt from the ledger, valuations and loan schedules). One series, so one teal line and no legend; the month-by-
 * month table below is the same data for anyone who'd rather read than hover.
 */
@Component({
  selector: 'app-finance-net-worth',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective, DatePipe, RouterLink, LoadError, BaseCurrencyPrompt],
  providers: [
    provideCharts({
      registerables: [
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Tooltip,
      ],
    }),
  ],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Net worth</h1>
        <p class="text-body-secondary mb-0 small">
          What you own minus what you owe — accounts, investments and loans, in your base currency.
        </p>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !worth()) {
        <app-load-error message="Couldn't work out your net worth." (retry)="load()" />
      } @else if (worth(); as w) {
        @if (w.currency; as currency) {
          <div class="d-flex flex-wrap gap-4 mb-3">
            <div>
              <div class="small text-body-secondary">Net worth today</div>
              <div class="h2 mb-0">{{ money(w.net, currency) }}</div>
              @if (change(); as c) {
                <div class="small text-body-secondary">
                  {{ c.change >= 0 ? 'Up' : 'Down' }} {{ money(abs(c.change), currency) }} since
                  {{ c.since | date }}
                </div>
              }
            </div>
            <div class="align-self-end">
              <div class="small text-body-secondary">Own</div>
              <div class="h5 mb-0">{{ money(w.assets, currency) }}</div>
            </div>
            <div class="align-self-end">
              <div class="small text-body-secondary">Owe</div>
              <div class="h5 mb-0">{{ money(w.liabilities, currency) }}</div>
            </div>
          </div>

          @if (w.items.length === 0) {
            <p class="text-body-secondary">
              Nothing to count yet — add an <a routerLink="/finance">account</a>, an
              <a routerLink="/finance/investments">investment</a> or a
              <a routerLink="/finance/loans">loan</a>.
            </p>
          } @else {
            <div class="card mb-4">
              <div class="card-body">
                <h2 class="h6">Over the last year</h2>
                <div style="position: relative; height: 220px">
                  <canvas
                    baseChart
                    type="line"
                    [data]="chartData()"
                    [options]="options()"
                    role="img"
                    [attr.aria-label]="summary()"
                  ></canvas>
                </div>
                <details class="mt-2 small">
                  <summary>Month by month</summary>
                  <div class="table-responsive">
                    <table class="table table-sm mb-0 mt-2">
                      <thead>
                        <tr>
                          <th scope="col">At the end of</th>
                          <th scope="col" class="text-end">Own</th>
                          <th scope="col" class="text-end">Owe</th>
                          <th scope="col" class="text-end">Net worth</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (p of w.history; track p.day) {
                          <tr>
                            <td>{{ p.day | date }}</td>
                            <td class="text-end text-nowrap">{{ money(p.assets, currency) }}</td>
                            <td class="text-end text-nowrap">
                              {{ money(p.liabilities, currency) }}
                            </td>
                            <td class="text-end text-nowrap">{{ money(p.net, currency) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>

            <div class="row g-3">
              @for (g of groups(); track g.type) {
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-header bg-transparent d-flex justify-content-between">
                      <a [routerLink]="g.link" class="h6 mb-0 text-decoration-none">{{
                        g.label
                      }}</a>
                      <span class="small fw-semibold">{{ money(g.total, currency) }}</span>
                    </div>
                    <ul class="list-group list-group-flush small">
                      @for (i of g.items; track i.id) {
                        <li class="list-group-item d-flex justify-content-between gap-2">
                          <span class="text-break">{{ i.name }}</span>
                          <span class="text-end text-nowrap">
                            @if (i.inBase === null) {
                              <span class="text-body-secondary"
                                >{{ money(i.amount, i.currency) }} · no rate, not counted</span
                              >
                            } @else {
                              {{ money(i.inBase, currency) }}
                              @if (i.currency !== currency) {
                                <span class="d-block text-body-secondary">
                                  {{ money(i.amount, i.currency) }}
                                </span>
                              }
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  </div>
                </div>
              }
            </div>
            <p class="small text-body-secondary mt-3 mb-0">
              Other currencies count at the latest rate you typed on a transaction in them. Loans
              count what's left after the instalments due so far; investments their latest
              valuation.
            </p>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceNetWorth {
  private readonly financeService = inject(FinanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly money = formatMoney;
  protected readonly abs = Math.abs;
  protected readonly worth = signal<NetWorth | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly change = computed(() => netWorthChange(this.worth()?.history ?? []));

  protected readonly groups = computed(() => {
    const items = this.worth()?.items ?? [];
    return GROUPS.map((g) => {
      const mine = items.filter((i) => i.type === g.type);
      return { ...g, items: mine, total: mine.reduce((sum, i) => sum + (i.inBase ?? 0), 0) };
    }).filter((g) => g.items.length > 0);
  });

  private label(day: string, index: number, count: number): string {
    return index === count - 1 ? 'Today' : formatDate(day, 'MMM yy', this.locale);
  }

  protected readonly summary = computed(() => {
    const w = this.worth();
    const c = this.change();
    if (!w?.currency || !c) {
      return '';
    }
    return `Net worth over the last year: from ${formatMoney(w.history[0].net, w.currency)} on ${formatDate(c.since, APP_DATE_FORMAT, this.locale)} to ${formatMoney(w.net, w.currency)} today.`;
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    const history = this.worth()?.history ?? [];
    return {
      labels: history.map((p, i) => this.label(p.day, i, history.length)),
      datasets: [
        {
          label: 'Net worth',
          data: history.map((p) => p.net),
          borderColor: teal,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: 2,
          pointHitRadius: 14,
          tension: 0,
        },
      ],
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const w = this.worth();
    const currency = w?.currency ?? 'INR';
    const history = w?.history ?? [];
    const compact = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        y: {
          border: { display: false },
          grid: { color: grid },
          ticks: {
            color: muted,
            font,
            maxTicksLimit: 5,
            callback: (value) => compact.format(Number(value)),
          },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => {
              const point = history[items[0]?.dataIndex ?? -1];
              return point
                ? items[0].dataIndex === history.length - 1
                  ? 'Today'
                  : formatDate(point.day, APP_DATE_FORMAT, this.locale)
                : '';
            },
            label: (item) => {
              const point = history[item.dataIndex];
              return [
                `Net worth ${formatMoney(point.net, currency)}`,
                `Own ${formatMoney(point.assets, currency)} · Owe ${formatMoney(point.liabilities, currency)}`,
              ];
            },
          },
        },
      },
    };
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.financeService
      .netWorth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (worth) => {
          this.worth.set(worth);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }
}
