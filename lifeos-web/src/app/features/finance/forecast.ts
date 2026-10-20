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
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  ChartConfiguration,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService, Forecast, ForecastLine } from '../../core/services/finance.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney } from './finance-view';
import { FORECAST_SOURCE_LABELS, dipDrivers, forecastRows, forecastTotals } from './forecast-view';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Days from today, for a time axis that keeps real spacing between days. */
function dayNumber(iso: string, from: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * The cash-flow forecast: an account's balance (or all accounts, in the base currency) carried forward with the money
 * already known to be coming — repeating transactions, bills (and the ones expected from their pattern), loan
 * instalments, subscriptions, premiums, tax payments, cashback. One series, so one teal line and no legend; the lowest
 * point is marked; the table below is the same data, item by item, for anyone who'd rather read than hover.
 */
@Component({
  selector: 'app-finance-forecast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective, DatePipe, LoadError, BaseCurrencyPrompt],
  providers: [
    provideCharts({
      registerables: [LineController, LineElement, PointElement, LinearScale, Tooltip],
    }),
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1">Cash-flow forecast</h1>
          <p class="text-body-secondary mb-0 small">
            Where your balances are heading with the money already known to be coming.
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <div class="btn-group btn-group-sm" role="group" aria-label="How far ahead">
            @for (m of horizons; track m) {
              <input
                type="radio"
                class="btn-check"
                name="forecast-months"
                [id]="'forecast-months-' + m"
                [checked]="months() === m"
                (change)="setMonths(m)"
              />
              <label class="btn btn-outline-secondary" [for]="'forecast-months-' + m"
                >{{ m }} months</label
              >
            }
          </div>
          @if (forecast(); as f) {
            <label class="visually-hidden" for="forecast-line">Which balance</label>
            <select
              id="forecast-line"
              class="form-select form-select-sm w-auto"
              (change)="lineKey.set($any($event.target).value)"
            >
              <option value="all" [selected]="lineKey() === 'all'">
                All accounts ({{ f.baseCurrency }})
              </option>
              @for (a of f.accounts; track $index) {
                <option [value]="keyOf(a)" [selected]="lineKey() === keyOf(a)">{{ a.name }}</option>
              }
            </select>
          }
        </div>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !forecast()) {
        <app-load-error [message]="failure()" (retry)="load()" />
      } @else if (forecast(); as f) {
        @if (line(); as l) {
          <div class="row g-3 mb-3">
            <div class="col-sm-4">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">Today</h2>
                  <div class="fs-5 fw-semibold">{{ money(l.start, l.currency) }}</div>
                </div>
              </section>
            </div>
            <div class="col-sm-4">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">Lowest point</h2>
                  <div class="fs-5 fw-semibold" [class.text-danger-emphasis]="l.lowest.balance < 0">
                    {{ money(l.lowest.balance, l.currency) }}
                  </div>
                  <div class="small text-body-secondary">
                    {{ l.lowest.day === f.from ? 'today' : (l.lowest.day | date) }}
                  </div>
                </div>
              </section>
            </div>
            <div class="col-sm-4">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">On {{ f.until | date }}</h2>
                  <div class="fs-5 fw-semibold" [class.text-danger-emphasis]="l.end < 0">
                    {{ money(l.end, l.currency) }}
                  </div>
                  <div class="small text-body-secondary">
                    {{ money(totals().moneyIn, l.currency) }} in ·
                    {{ money(totals().moneyOut, l.currency) }} out
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-body">
              <h2 class="h6">{{ l.name }}</h2>
              <div style="position: relative; height: 240px">
                <canvas
                  baseChart
                  type="line"
                  [data]="chartData()"
                  [options]="options()"
                  role="img"
                  [attr.aria-label]="summary()"
                ></canvas>
              </div>
              <p class="small text-body-secondary mb-0 mt-2">
                Only money already known: repeating transactions, bills, loan instalments,
                subscriptions, premiums, tax payments and cashback. Expected bills are estimates
                from each provider's last three.
                @if (l.accountId !== null) {
                  Bills, premiums and tax not tied to an account count in "All accounts" only.
                }
              </p>
              @if (f.unconverted.length && l.accountId === null) {
                <p class="small mb-0 mt-1">
                  Left out for want of a rate: {{ f.unconverted.join(', ') }} — set one in Settings
                  → Exchange rates.
                </p>
              }
            </div>
          </div>

          @if (drivers().length && l.lowest.balance < l.start) {
            <section class="card mb-3" aria-labelledby="forecast-drivers">
              <div class="card-body">
                <h2 id="forecast-drivers" class="h6">
                  What takes it down to {{ money(l.lowest.balance, l.currency) }}
                </h2>
                <ul class="list-unstyled small mb-0">
                  @for (r of drivers(); track $index) {
                    <li class="d-flex justify-content-between gap-2">
                      <span class="min-w-0 text-break">
                        {{ r.item.title }} · {{ r.item.day | date }}
                        @if (r.item.isEstimate) {
                          <span class="text-body-secondary">(estimate)</span>
                        }
                      </span>
                      <span class="text-nowrap">{{ money(r.amount ?? 0, l.currency) }}</span>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }

          <section class="card" aria-labelledby="forecast-items">
            <div class="card-body">
              <h2 id="forecast-items" class="h6">Coming up</h2>
              @if (rows().length === 0) {
                <p class="small text-body-secondary mb-0">
                  Nothing known to be coming in this time.
                </p>
              } @else {
                <div class="table-responsive">
                  <table class="table table-sm mb-0 small align-middle">
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col">What</th>
                        @if (l.accountId === null) {
                          <th scope="col">Account</th>
                        }
                        <th scope="col" class="text-end">Amount</th>
                        <th scope="col" class="text-end">Balance after</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of rows(); track $index) {
                        <tr>
                          <td class="text-nowrap">{{ r.item.day | date }}</td>
                          <td>
                            <span class="text-break">{{ r.item.title }}</span>
                            <span class="text-body-secondary">
                              · {{ sourceLabels[r.item.source] }}</span
                            >
                          </td>
                          @if (l.accountId === null) {
                            <td class="text-body-secondary">{{ r.item.accountName ?? '—' }}</td>
                          }
                          <td class="text-end text-nowrap">
                            @if (r.amount === null) {
                              <span class="text-body-secondary"
                                >{{ money(r.item.amount, r.item.currency) }} (no rate)</span
                              >
                            } @else {
                              {{ r.item.isEstimate ? '≈ ' : '' }}{{ money(r.amount, l.currency) }}
                            }
                          </td>
                          <td
                            class="text-end text-nowrap"
                            [class.text-danger-emphasis]="(r.balanceAfter ?? 0) < 0"
                          >
                            {{ r.balanceAfter === null ? '—' : money(r.balanceAfter, l.currency) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </section>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceForecast {
  private readonly financeService = inject(FinanceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly horizons = [3, 6, 12] as const;
  protected readonly sourceLabels = FORECAST_SOURCE_LABELS;
  protected readonly money = formatMoney;
  protected readonly months = signal<3 | 6 | 12>(3);
  protected readonly forecast = signal<Forecast | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly failure = signal("Couldn't load the forecast.");
  /** "all" or "<accountId>:<currency>". */
  protected readonly lineKey = signal('all');

  protected readonly line = computed<ForecastLine | null>(() => {
    const f = this.forecast();
    if (!f) {
      return null;
    }
    return this.lineKey() === 'all'
      ? f.overall
      : (f.accounts.find((a) => this.keyOf(a) === this.lineKey()) ?? f.overall);
  });
  protected readonly rows = computed(() => {
    const l = this.line();
    return l ? forecastRows(l, this.forecast()?.items ?? []) : [];
  });
  protected readonly totals = computed(() => forecastTotals(this.rows()));
  protected readonly drivers = computed(() => {
    const l = this.line();
    return l ? dipDrivers(this.rows(), l.lowest.day) : [];
  });

  protected readonly summary = computed(() => {
    const l = this.line();
    const f = this.forecast();
    if (!l || !f) {
      return '';
    }
    const day = (iso: string) => formatDate(iso, APP_DATE_FORMAT, this.locale);
    return `${l.name}: ${formatMoney(l.start, l.currency)} today, lowest ${formatMoney(l.lowest.balance, l.currency)} on ${day(l.lowest.day)}, ${formatMoney(l.end, l.currency)} on ${day(f.until)}.`;
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    const f = this.forecast();
    const l = this.line();
    if (!f || !l) {
      return { datasets: [] };
    }
    const lowestIndex = l.points.findIndex((p) => p.day === l.lowest.day);
    return {
      datasets: [
        {
          label: l.name,
          data: l.points.map((p) => ({ x: dayNumber(p.day, f.from), y: p.balance })),
          borderColor: teal,
          borderWidth: 2,
          // The balance holds until the day money moves, then steps.
          stepped: 'after',
          pointRadius: l.points.map((_, i) => (i === lowestIndex ? 5 : 0)),
          pointHoverRadius: 5,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: 2,
          pointHitRadius: 14,
        },
      ],
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const zero = token('--lifeos-ink', '#141b2e');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const f = this.forecast();
    const l = this.line();
    const from = f?.from ?? todayIso();
    const currency = l?.currency ?? 'INR';
    const compact = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const dateOf = (x: number) =>
      formatDate(addDaysIso(from, Math.round(x)), APP_DATE_FORMAT, this.locale);
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: f ? dayNumber(f.until, from) : undefined,
          border: { color: grid },
          grid: { display: false },
          ticks: {
            color: muted,
            font,
            maxRotation: 0,
            maxTicksLimit: 6,
            callback: (value) => dateOf(Number(value)).slice(0, 6),
          },
        },
        y: {
          border: { display: false },
          // The zero line is the one that matters: drawn in ink, the rest recessive.
          grid: { color: (ctx) => (ctx.tick.value === 0 ? zero : grid) },
          ticks: {
            color: muted,
            font,
            maxTicksLimit: 5,
            callback: (value) => compact.format(Number(value)),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items[0] ? dateOf(Number(items[0].parsed.x)) : ''),
            label: (item) => `Balance ${formatMoney(Number(item.parsed.y), currency)}`,
          },
        },
      },
    };
  });

  constructor() {
    this.load();
  }

  protected keyOf(line: ForecastLine): string {
    return `${line.accountId}:${line.currency}`;
  }

  protected setMonths(months: 3 | 6 | 12): void {
    this.months.set(months);
    this.load();
  }

  protected load(): void {
    this.financeService
      .forecast(this.months())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (forecast) => {
          this.forecast.set(forecast);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.failure.set(apiErrorMessage(err, "Couldn't load the forecast."));
          this.loadFailed.set(true);
        },
      });
  }
}
