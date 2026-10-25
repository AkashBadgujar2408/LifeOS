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
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  ChartConfiguration,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { APP_DATE_FORMAT, APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  AssistantService,
  ForecastPrediction,
  PredictedLine,
} from '../../core/services/assistant.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney } from './finance-view';
import { FORECAST_SOURCE_LABELS, forecastRows, forecastTotals } from './forecast-view';

type Horizon = 3 | 6 | 12;

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** `#rrggbb` → the same colour at `alpha`, for the range band. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m
    ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
    : hex;
}

/** Days from today, for a time axis that keeps real spacing between days. */
function dayNumber(iso: string, from: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Words for Mistral's probability, so the card reads without the number too. */
export function confidenceWord(confidence: number): string {
  return confidence >= 80
    ? 'Very likely'
    : confidence >= 60
      ? 'Likely'
      : confidence >= 40
        ? 'Uncertain'
        : 'Unlikely';
}

/**
 * The cash-flow forecast (Session 96a): Mistral reads the patterns in the user's past income and spending (each a
 * typical monthly amount, a low–high range and its confidence) and its own probability that the money turns out as
 * predicted; LifeOS adds those patterns and the money already known to be coming to today's balances. The saved
 * prediction shows with when it was made; only Predict again asks Mistral (on the user's own key). One series —
 * the expected line, with its low–high range as a band — so no legend; the table below the chart is the same data.
 */
@Component({
  selector: 'app-finance-forecast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective, DatePipe, RouterLink, LoadError, BaseCurrencyPrompt],
  providers: [
    provideCharts({
      registerables: [LineController, LineElement, PointElement, LinearScale, Tooltip, Filler],
    }),
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1">Cash-flow forecast</h1>
          <p class="text-body-secondary mb-0 small">
            Where your money is heading, from the patterns Mistral AI reads in your own history.
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
                [disabled]="predicting()"
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
                <option [value]="keyOf(a)" [selected]="lineKey() === keyOf(a)">
                  {{ a.name }}
                </option>
              }
            </select>
          }
          @if (assistantOn() && forecast()) {
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              [disabled]="predicting()"
              (click)="predict()"
            >
              <i class="bi bi-arrow-repeat"></i> Predict again
            </button>
          }
        </div>
      </div>

      <app-base-currency-prompt />

      @if (predicting()) {
        <div class="small text-body-secondary mb-2" role="status">
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          Asking Mistral to read your patterns…
        </div>
      }
      @if (predictError(); as message) {
        <div class="alert alert-warning small py-2" role="alert">{{ message }}</div>
      }

      @if (loading()) {
        <p class="text-body-secondary">Loading...</p>
      } @else if (loadFailed()) {
        <app-load-error [message]="failure()" (retry)="load()" />
      } @else if (forecast(); as f) {
        @if (line(); as l) {
          <p class="small text-body-secondary mb-2">
            Last updated {{ f.predictedAt | date: dateTime }} · Mistral ({{ f.model }}) ·
            {{ f.months }} months from {{ f.from | date }}
          </p>
          <div class="row g-3 mb-3">
            <div class="col-sm-6 col-lg-3">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">Today</h2>
                  <div class="fs-5 fw-semibold">{{ money(l.start, l.currency) }}</div>
                  <div class="small text-body-secondary">on {{ f.from | date }}</div>
                </div>
              </section>
            </div>
            <div class="col-sm-6 col-lg-3">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">Lowest predicted</h2>
                  <div class="fs-5 fw-semibold" [class.text-danger-emphasis]="l.lowest.balance < 0">
                    {{ money(l.lowest.balance, l.currency) }}
                  </div>
                  <div class="small text-body-secondary">
                    {{ l.lowest.day === f.from ? 'today' : (l.lowest.day | date) }}
                    @if (l.lowest.low !== l.lowest.balance) {
                      · could be {{ money(l.lowest.low, l.currency) }}
                    }
                  </div>
                </div>
              </section>
            </div>
            <div class="col-sm-6 col-lg-3">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">Predicted on {{ f.until | date }}</h2>
                  <div class="fs-5 fw-semibold" [class.text-danger-emphasis]="l.end.balance < 0">
                    {{ money(l.end.balance, l.currency) }}
                  </div>
                  <div class="small text-body-secondary">
                    between {{ money(l.end.low, l.currency) }} and
                    {{ money(l.end.high, l.currency) }}
                  </div>
                </div>
              </section>
            </div>
            <div class="col-sm-6 col-lg-3">
              <section class="card h-100 confidence-card">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">How likely</h2>
                  <div class="fs-5 fw-semibold">
                    {{ f.confidence }}% · {{ confidenceWord(f.confidence) }}
                  </div>
                  <div
                    class="progress my-1"
                    role="progressbar"
                    aria-label="Mistral's probability"
                    [attr.aria-valuenow]="f.confidence"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    style="height: 6px"
                  >
                    <div class="progress-bar confidence-bar" [style.width.%]="f.confidence"></div>
                  </div>
                  <div class="small text-body-secondary">
                    Mistral's estimate that your money lands in the range
                    @if (f.confidenceReason) {
                      — {{ f.confidenceReason }}
                    }
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
                The line is the expected balance; the band runs from the patterns at their worst to
                their best. LifeOS does the sums: today's balance, the known money below, and each
                pattern once a month.
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

          <div class="table-responsive mb-3">
            <table class="table table-sm small mb-0 align-middle">
              <caption class="visually-hidden">
                Predicted balance by day
              </caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col" class="text-end">Expected</th>
                  <th scope="col" class="text-end">Range</th>
                </tr>
              </thead>
              <tbody>
                @for (p of l.points; track p.day; let first = $first) {
                  <tr>
                    <td>{{ p.day | date }}{{ first ? ' (today)' : '' }}</td>
                    <td class="text-end text-nowrap" [class.text-danger-emphasis]="p.balance < 0">
                      {{ money(p.balance, l.currency) }}
                    </td>
                    <td class="text-end text-nowrap text-body-secondary">
                      {{
                        first ? '—' : money(p.low, l.currency) + ' – ' + money(p.high, l.currency)
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <section class="mb-3" aria-labelledby="forecast-patterns">
          <h2 id="forecast-patterns" class="h6">Patterns Mistral read</h2>
          @if (f.summary) {
            <p class="small forecast-summary">{{ f.summary }}</p>
          }
          @if (f.patterns.length === 0) {
            <p class="small text-body-secondary">
              No patterns yet — the forecast is the known money only. Patterns appear once there's
              some income and spending recorded.
            </p>
          } @else {
            <div class="row g-2">
              @for (p of f.patterns; track $index) {
                <div class="col-sm-6 col-lg-4">
                  <section class="card h-100">
                    <div class="card-body py-2">
                      <div class="d-flex justify-content-between gap-2">
                        <h3 class="h6 mb-0 text-break">
                          <i
                            class="bi"
                            [class.bi-arrow-down-left]="p.kind === 'Income'"
                            [class.bi-arrow-up-right]="p.kind === 'Expense'"
                            aria-hidden="true"
                          ></i>
                          {{ p.name }}
                        </h3>
                        <span class="badge text-bg-light border text-nowrap"
                          >{{ p.confidence }}% sure</span
                        >
                      </div>
                      <div class="fw-semibold">
                        {{ p.kind === 'Income' ? '+' : '−' }}{{ money(p.typical, f.baseCurrency) }}
                        <span class="small fw-normal text-body-secondary">a month</span>
                      </div>
                      <div class="small text-body-secondary">
                        @if (p.low !== p.high) {
                          {{ money(p.low, f.baseCurrency) }} – {{ money(p.high, f.baseCurrency) }} ·
                        }
                        {{ p.lineName }}
                      </div>
                      @if (p.basis) {
                        <div class="small text-body-secondary">{{ p.basis }}</div>
                      }
                      <div class="small text-body-secondary text-break">
                        From: {{ p.from.join(', ') }}
                      </div>
                    </div>
                  </section>
                </div>
              }
            </div>
          }
          @if (f.historyFrom && f.historyTo) {
            <p class="small text-body-secondary mt-2 mb-1">
              Read from {{ f.historyFrom | date: 'MMM yyyy' }} to
              {{ f.historyTo | date: 'MMM yyyy' }}. Money a running repeating transaction wrote is
              left out — its future is in the known money below.
            </p>
          }
          <details class="small">
            <summary class="text-body-secondary">What was sent to Mistral</summary>
            @for (item of f.sent; track $index) {
              <div class="fw-semibold mt-2">{{ item.label }}</div>
              <pre class="sent-item border rounded p-2 mb-0">{{ item.content }}</pre>
            }
          </details>
        </section>

        @if (line(); as l) {
          <section class="card" aria-labelledby="forecast-items">
            <div class="card-body">
              <h2 id="forecast-items" class="h6">Known money coming</h2>
              <p class="small text-body-secondary">
                Repeating transactions, bills (expected ones estimated from each provider's last
                three), loan instalments, subscriptions, premiums, tax payments and cashback — as
                they stood when the forecast was made.
              </p>
              @if (rows().length === 0) {
                <p class="small text-body-secondary mb-0">
                  Nothing known to be coming in this time.
                </p>
              } @else {
                <div class="small text-body-secondary mb-1">
                  {{ money(totals().moneyIn, l.currency) }} in ·
                  {{ money(totals().moneyOut, l.currency) }} out
                </div>
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
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </section>
        }
      } @else if (assistantOn()) {
        @if (!predicting()) {
          <section class="card">
            <div class="card-body">
              <h2 class="h6">No forecast for {{ months() }} months yet</h2>
              <p class="small mb-2">
                Mistral reads the patterns in your income and spending; LifeOS adds them to your
                balances and the money already known to be coming.
              </p>
              <button type="button" class="btn btn-primary btn-sm" (click)="predict()">
                Predict
              </button>
            </div>
          </section>
        }
      } @else {
        <section class="card">
          <div class="card-body">
            <h2 class="h6">The forecast runs on Mistral AI</h2>
            <p class="small mb-2">
              Mistral reads the patterns in your past income and spending — a steady salary, odd
              side income, spending that swings — and says how likely the forecast is. It uses
              <strong>your own Mistral API key</strong>, with the assistant switched on.
            </p>
            <a class="btn btn-primary btn-sm" routerLink="/settings" fragment="assistant-heading"
              >Open Settings › AI assistant</a
            >
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .forecast-summary {
      white-space: pre-line;
      border-left: 3px solid var(--lifeos-teal);
      padding-left: 0.85rem;
    }
    .confidence-bar {
      background: var(--lifeos-teal);
    }
    .sent-item {
      max-height: 14rem;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 0.75rem;
    }
  `,
})
export class FinanceForecast {
  private readonly assistantService = inject(AssistantService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly horizons = [3, 6, 12] as const;
  protected readonly sourceLabels = FORECAST_SOURCE_LABELS;
  protected readonly money = formatMoney;
  protected readonly confidenceWord = confidenceWord;
  protected readonly dateTime = APP_DATE_TIME_FORMAT;
  protected readonly assistantOn = signal(false);
  protected readonly months = signal<Horizon>(3);
  protected readonly forecast = signal<ForecastPrediction | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly failure = signal("Couldn't load the forecast.");
  protected readonly predicting = signal(false);
  protected readonly predictError = signal<string | null>(null);
  /** "all" or "<accountId>:<currency>". */
  protected readonly lineKey = signal('all');

  protected readonly line = computed<PredictedLine | null>(() => {
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

  protected readonly summary = computed(() => {
    const l = this.line();
    const f = this.forecast();
    if (!l || !f) {
      return '';
    }
    const day = (iso: string) => formatDate(iso, APP_DATE_FORMAT, this.locale);
    return `${l.name}: ${formatMoney(l.start, l.currency)} today; expected lowest ${formatMoney(l.lowest.balance, l.currency)} on ${day(l.lowest.day)} and ${formatMoney(l.end.balance, l.currency)} on ${day(f.until)} (between ${formatMoney(l.end.low, l.currency)} and ${formatMoney(l.end.high, l.currency)}); Mistral puts it at ${f.confidence}% likely.`;
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    const f = this.forecast();
    const l = this.line();
    if (!f || !l) {
      return { datasets: [] };
    }
    const x = (day: string) => dayNumber(day, f.from);
    const lowestIndex = l.points.findIndex((p) => p.day === l.lowest.day);
    const band = withAlpha(teal, 0.15);
    return {
      datasets: [
        // The range: the high edge, filled down to the low edge — part of the one series, so no legend.
        {
          label: 'Best',
          data: l.points.map((p) => ({ x: x(p.day), y: p.high })),
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          backgroundColor: band,
          fill: '+1',
        },
        {
          label: 'Worst',
          data: l.points.map((p) => ({ x: x(p.day), y: p.low })),
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          fill: false,
        },
        {
          label: l.name,
          data: l.points.map((p) => ({ x: x(p.day), y: p.balance })),
          borderColor: teal,
          borderWidth: 2,
          pointRadius: l.points.map((_, i) => (i === lowestIndex ? 5 : 3)),
          pointHoverRadius: 5,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: 2,
          pointHitRadius: 14,
          fill: false,
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
          // One tooltip per day, from the expected line, carrying the range.
          filter: (item) => item.datasetIndex === 2,
          callbacks: {
            title: (items) => (items[0] ? dateOf(Number(items[0].parsed.x)) : ''),
            label: (item) => {
              const point = l?.points[item.dataIndex];
              if (!point || item.dataIndex === 0) {
                return `Balance today ${formatMoney(Number(item.parsed.y), currency)}`;
              }
              return [
                `Expected ${formatMoney(point.balance, currency)}`,
                `Range ${formatMoney(point.low, currency)} – ${formatMoney(point.high, currency)}`,
              ];
            },
          },
        },
      },
    };
  });

  constructor() {
    this.assistantService
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => this.assistantOn.set(settings.hasKey && settings.isEnabled),
        // No Predict button when the settings can't be read — a saved forecast still shows.
        error: () => this.assistantOn.set(false),
      });
    this.load();
  }

  protected keyOf(line: PredictedLine): string {
    return `${line.accountId}:${line.currency}`;
  }

  protected setMonths(months: Horizon): void {
    this.months.set(months);
    this.predictError.set(null);
    this.load();
  }

  /** The saved forecast for the chosen horizon — never asks Mistral. */
  protected load(): void {
    const months = this.months();
    this.loading.set(true);
    this.assistantService
      .savedForecast(months)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (forecast) => {
          if (months !== this.months()) {
            return;
          }
          this.forecast.set(forecast);
          this.loadFailed.set(false);
          this.loading.set(false);
        },
        error: (err) => {
          this.failure.set(apiErrorMessage(err, "Couldn't load the forecast."));
          this.forecast.set(null);
          this.loadFailed.set(true);
          this.loading.set(false);
        },
      });
  }

  /** Asks Mistral again and shows (and keeps) the new forecast; a failure leaves the saved one in place. */
  protected predict(): void {
    const months = this.months();
    this.predicting.set(true);
    this.predictError.set(null);
    this.assistantService
      .predictForecast(months)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (forecast) => {
          if (months === this.months()) {
            this.forecast.set(forecast);
            this.loadFailed.set(false);
          }
          this.predicting.set(false);
        },
        error: (err) => {
          this.predictError.set(apiErrorMessage(err, 'Could not get a new forecast.'));
          this.predicting.set(false);
        },
      });
  }
}
