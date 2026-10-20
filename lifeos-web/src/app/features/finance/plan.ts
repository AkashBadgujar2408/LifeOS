import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  CategoryScale,
  ChartConfiguration,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService, FinancialPlan } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney } from './finance-view';
import { SAVINGS_STATUS_LABELS, retirementGap, retirementVerdict } from './plan-view';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Savings and retirement projections: each savings goal's monthly need against what's actually gone in lately, and
 * the retirement corpus you'd need against what you're projected to have, age by age. Every figure is recomputed from
 * the assumptions (editable here) — nothing is stored but the assumptions themselves.
 */
@Component({
  selector: 'app-finance-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BaseChartDirective,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    NgbInputDatepicker,
    LoadError,
    BaseCurrencyPrompt,
  ],
  providers: [
    provideCharts({
      registerables: [
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Tooltip,
        Legend,
      ],
    }),
  ],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Savings & retirement plan</h1>
        <p class="text-body-secondary mb-0 small">
          What each goal needs a month, and whether retirement is on course — from the assumptions
          below.
        </p>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !plan()) {
        <app-load-error message="Couldn't load your plan." (retry)="load()" />
      } @else if (plan(); as p) {
        <section class="mb-4" aria-labelledby="plan-goals">
          <h2 id="plan-goals" class="h5 mb-3">Savings goals</h2>
          @if (p.goals.length === 0) {
            <p class="small text-body-secondary">
              No savings goals yet. Give a goal an amount to save and link the accounts or
              investments that count toward it — it shows up here with what it needs a month.
            </p>
          } @else {
            <div class="row g-3">
              @for (g of p.goals; track g.goalId) {
                <div class="col-md-6">
                  <section class="card h-100">
                    <div class="card-body">
                      <div class="d-flex justify-content-between gap-2 align-items-start">
                        <a
                          [routerLink]="['/goals', g.goalId]"
                          class="fw-semibold link-body-emphasis text-decoration-none text-break"
                        >
                          {{ g.title }}
                        </a>
                        <span
                          class="badge border"
                          [class.text-bg-light]="g.status !== 'Behind' && g.status !== 'Overdue'"
                          [class.text-bg-warning]="g.status === 'Behind' || g.status === 'Overdue'"
                        >
                          {{ statusLabels[g.status] }}
                        </span>
                      </div>
                      <div class="small text-body-secondary mb-2">
                        {{ money(g.saved, g.currency) }} of
                        {{ money(g.targetAmount, g.currency) }} ({{ g.percent }}%)
                        @if (g.targetDate) {
                          · by {{ g.targetDate | date }}
                        }
                      </div>
                      <div
                        class="progress mb-2"
                        role="progressbar"
                        [attr.aria-valuenow]="g.percent"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        [attr.aria-label]="g.title + ' saved'"
                      >
                        <div class="progress-bar" [style.width.%]="g.percent"></div>
                      </div>
                      @if (
                        g.status === 'Behind' || g.status === 'OnTrack' || g.status === 'Overdue'
                      ) {
                        <dl class="row small mb-0 g-1">
                          <dt class="col-7 fw-normal text-body-secondary">
                            Needed a month{{ g.monthsLeft ? ' (' + g.monthsLeft + ' left)' : '' }}
                          </dt>
                          <dd class="col-5 mb-0 text-end fw-semibold">
                            {{ money(g.neededPerMonth, g.currency) }}
                          </dd>
                          <dt class="col-7 fw-normal text-body-secondary">
                            Put in lately (a month)
                          </dt>
                          <dd class="col-5 mb-0 text-end">
                            {{ money(g.actualPerMonth, g.currency) }}
                          </dd>
                        </dl>
                      } @else if (g.status === 'NoDate') {
                        <p class="small text-body-secondary mb-0">
                          Give it a target date to see what it needs a month.
                        </p>
                      }
                    </div>
                  </section>
                </div>
              }
            </div>
          }
        </section>

        <section class="mb-4" aria-labelledby="plan-retirement">
          <h2 id="plan-retirement" class="h5 mb-3">Retirement</h2>
          @if (p.retirement; as r) {
            <p class="mb-3">{{ verdict() }}</p>
            <div class="row g-3 mb-3">
              <div class="col-sm-6 col-lg-3">
                <section class="card h-100">
                  <div class="card-body">
                    <h3 class="h6 text-body-secondary mb-1">
                      Needed at {{ p.assumptions.retirementAge }}
                    </h3>
                    <div class="fs-5 fw-semibold">{{ money(r.corpusNeeded, p.baseCurrency) }}</div>
                    <div class="small text-body-secondary">
                      "25×" rule: {{ money(r.ruleOf25, p.baseCurrency) }}
                    </div>
                  </div>
                </section>
              </div>
              <div class="col-sm-6 col-lg-3">
                <section class="card h-100">
                  <div class="card-body">
                    <h3 class="h6 text-body-secondary mb-1">Projected then</h3>
                    <div class="fs-5 fw-semibold">
                      {{ money(r.projectedCorpus, p.baseCurrency) }}
                    </div>
                    <div class="small" [class.text-danger-emphasis]="gap() < 0">
                      {{
                        gap() < 0
                          ? 'short by ' + money(-gap(), p.baseCurrency)
                          : money(gap(), p.baseCurrency) + ' to spare'
                      }}
                    </div>
                  </div>
                </section>
              </div>
              <div class="col-sm-6 col-lg-3">
                <section class="card h-100">
                  <div class="card-body">
                    <h3 class="h6 text-body-secondary mb-1">Spending a month then</h3>
                    <div class="fs-5 fw-semibold">
                      {{ money(r.monthlySpendingAtRetirement, p.baseCurrency) }}
                    </div>
                    <div class="small text-body-secondary">
                      {{ money(p.assumptions.monthlySpending ?? 0, p.baseCurrency) }} today, with
                      inflation
                    </div>
                  </div>
                </section>
              </div>
              <div class="col-sm-6 col-lg-3">
                <section class="card h-100">
                  <div class="card-body">
                    <h3 class="h6 text-body-secondary mb-1">Starting from</h3>
                    <div class="fs-5 fw-semibold">{{ money(p.investments, p.baseCurrency) }}</div>
                    <div class="small text-body-secondary">
                      invested · + {{ money(p.monthlySavingUsed, p.baseCurrency) }} a month
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <div class="card mb-3">
              <div class="card-body">
                <h3 class="h6">By age</h3>
                <div style="position: relative; height: 240px">
                  <canvas
                    baseChart
                    type="line"
                    [data]="chartData()"
                    [options]="options()"
                    role="img"
                    [attr.aria-label]="verdict()"
                  ></canvas>
                </div>
                <details class="mt-2 small">
                  <summary>Year by year</summary>
                  <div class="table-responsive">
                    <table class="table table-sm mb-0 mt-2">
                      <thead>
                        <tr>
                          <th scope="col">Age</th>
                          <th scope="col" class="text-end">Projected</th>
                          <th scope="col" class="text-end">Needed to retire then</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (pt of r.points; track pt.age) {
                          <tr [class.fw-semibold]="pt.age === p.assumptions.retirementAge">
                            <td>{{ pt.age }}</td>
                            <td class="text-end">{{ money(pt.projected, p.baseCurrency) }}</td>
                            <td class="text-end">{{ money(pt.needed, p.baseCurrency) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>
          } @else {
            <p class="small text-body-secondary">
              To project retirement, add {{ p.missing.join(' and ') }} below.
            </p>
          }
        </section>

        <section class="card" aria-labelledby="plan-assumptions">
          <div class="card-body">
            <h2 id="plan-assumptions" class="h5">Assumptions</h2>
            @if (!p.assumptions.isSaved) {
              <p class="small text-body-secondary">
                These are starting values — change them to match your situation and save.
              </p>
            }
            <form [formGroup]="form" (ngSubmit)="save()" novalidate class="row g-3">
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="plan-return">Expected return (% a year)</label>
                <input
                  id="plan-return"
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  class="form-control"
                  [class.is-invalid]="fieldError('expectedReturnPercent')"
                  formControlName="expectedReturnPercent"
                  placeholder="e.g. 10"
                />
                @if (fieldError('expectedReturnPercent'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="plan-inflation">Inflation (% a year)</label>
                <input
                  id="plan-inflation"
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  class="form-control"
                  [class.is-invalid]="fieldError('inflationPercent')"
                  formControlName="inflationPercent"
                  placeholder="e.g. 6"
                />
                @if (fieldError('inflationPercent'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="plan-retire">Retire at (age)</label>
                <input
                  id="plan-retire"
                  type="number"
                  min="30"
                  max="100"
                  class="form-control"
                  [class.is-invalid]="fieldError('retirementAge')"
                  formControlName="retirementAge"
                  placeholder="e.g. 60"
                />
                @if (fieldError('retirementAge'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="plan-years">Years in retirement</label>
                <input
                  id="plan-years"
                  type="number"
                  min="1"
                  max="60"
                  class="form-control"
                  [class.is-invalid]="fieldError('yearsInRetirement')"
                  formControlName="yearsInRetirement"
                  placeholder="e.g. 25"
                />
                @if (fieldError('yearsInRetirement'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-4">
                <label class="form-label" for="plan-spending"
                  >Spending a month in retirement (today's money)</label
                >
                <input
                  id="plan-spending"
                  type="number"
                  min="0"
                  step="100"
                  class="form-control"
                  [class.is-invalid]="fieldError('monthlySpending')"
                  formControlName="monthlySpending"
                  placeholder="e.g. 50000"
                />
                @if (fieldError('monthlySpending'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-4">
                <label class="form-label" for="plan-saving"
                  >Saving a month <span class="text-body-secondary small">(optional)</span></label
                >
                <input
                  id="plan-saving"
                  type="number"
                  min="0"
                  step="100"
                  class="form-control"
                  [class.is-invalid]="fieldError('monthlySaving')"
                  formControlName="monthlySaving"
                  [placeholder]="savingPlaceholder()"
                />
                <div class="form-text">Blank: your last three months' income − spending.</div>
                @if (fieldError('monthlySaving'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <div class="col-sm-6 col-lg-4">
                @if (p.ageFromHealth) {
                  <span class="form-label d-block">Age</span>
                  <p class="mb-0 pt-2">
                    {{ p.age }}
                    <span class="small text-body-secondary">(from your Health profile)</span>
                  </p>
                } @else {
                  <label class="form-label" for="plan-birth">Date of birth</label>
                  <div class="input-group">
                    <input
                      id="plan-birth"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="fieldError('birthDate')"
                      formControlName="birthDate"
                      placeholder="e.g. 20/Oct/1996"
                      autocomplete="off"
                      ngbDatepicker
                      #birthPicker="ngbDatepicker"
                      [minDate]="minBirth"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick your date of birth"
                      (click)="birthPicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                  @if (fieldError('birthDate'); as error) {
                    <div class="invalid-feedback d-block">{{ error }}</div>
                  }
                }
              </div>
              <div class="col-12">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  Save and recalculate
                </button>
              </div>
            </form>
          </div>
        </section>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinancePlan {
  private readonly financeService = inject(FinanceService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly money = (amount: number, currency: string | null) =>
    formatMoney(amount, currency ?? 'INR');
  protected readonly statusLabels = SAVINGS_STATUS_LABELS;
  protected readonly minBirth = { year: 1920, month: 1, day: 1 };
  protected readonly plan = signal<FinancialPlan | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    expectedReturnPercent: this.fb.control<number | null>(10, [
      Validators.required,
      Validators.min(0),
      Validators.max(30),
    ]),
    inflationPercent: this.fb.control<number | null>(6, [
      Validators.required,
      Validators.min(0),
      Validators.max(30),
    ]),
    retirementAge: this.fb.control<number | null>(60, [
      Validators.required,
      Validators.min(30),
      Validators.max(100),
    ]),
    yearsInRetirement: this.fb.control<number | null>(25, [
      Validators.required,
      Validators.min(1),
      Validators.max(60),
    ]),
    monthlySpending: this.fb.control<number | null>(null, Validators.min(1)),
    monthlySaving: this.fb.control<number | null>(null, Validators.min(0)),
    birthDate: this.fb.control<string | null>(null),
  });

  protected readonly verdict = computed(() => {
    const p = this.plan();
    return p?.retirement ? retirementVerdict(p.retirement, p.assumptions.retirementAge) : '';
  });
  protected readonly gap = computed(() => {
    const r = this.plan()?.retirement;
    return r ? retirementGap(r) : 0;
  });
  protected readonly savingPlaceholder = computed(() => {
    const p = this.plan();
    return p?.monthlySavingActual !== null && p?.monthlySavingActual !== undefined
      ? `Lately ${formatMoney(p.monthlySavingActual, p.baseCurrency ?? 'INR')}`
      : 'e.g. 20000';
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const points = this.plan()?.retirement?.points ?? [];
    const projected = token('--lifeos-series-1', '#2a78d6');
    const needed = token('--lifeos-series-2', '#eb6834');
    const line = (color: string) => ({
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBorderColor: token('--lifeos-surface', '#ffffff'),
      pointBorderWidth: 2,
      pointHitRadius: 14,
      tension: 0,
    });
    return {
      labels: points.map((p) => String(p.age)),
      datasets: [
        { label: 'Projected', data: points.map((p) => p.projected), ...line(projected) },
        // Dashed as well as a different colour, so the two never rely on colour alone.
        {
          label: 'Needed to retire',
          data: points.map((p) => p.needed),
          ...line(needed),
          borderDash: [6, 4],
        },
      ],
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const currency = this.plan()?.baseCurrency ?? 'INR';
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
            callback: (v) => compact.format(Number(v)),
          },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          title: { display: true, text: 'Age', color: muted, font },
          ticks: { color: muted, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'start',
          labels: { color: muted, font, usePointStyle: true, pointStyle: 'line' },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items[0] ? `Age ${items[0].label}` : ''),
            label: (item) =>
              `${item.dataset.label} ${formatMoney(Number(item.parsed.y), currency)}`,
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
      .plan()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plan) => {
          this.show(plan);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected fieldError(
    name:
      | 'expectedReturnPercent'
      | 'inflationPercent'
      | 'retirementAge'
      | 'yearsInRetirement'
      | 'monthlySpending'
      | 'monthlySaving'
      | 'birthDate',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'expectedReturnPercent':
      case 'inflationPercent':
        return 'A % between 0 and 30.';
      case 'retirementAge':
        return 'Between 30 and 100.';
      case 'yearsInRetirement':
        return '1 to 60 years.';
      case 'monthlySpending':
        return 'More than zero, or leave it blank.';
      case 'monthlySaving':
        return 'Can’t be negative.';
      default:
        return control.errors['future']
          ? 'That can’t be in the future.'
          : dateFieldError(control.errors);
    }
  }

  protected save(): void {
    const v = this.form.getRawValue();
    if (v.birthDate && v.birthDate > todayIso()) {
      this.form.controls.birthDate.setErrors({ future: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.financeService
      .savePlanAssumptions({
        expectedReturnPercent: v.expectedReturnPercent!,
        inflationPercent: v.inflationPercent!,
        retirementAge: v.retirementAge!,
        yearsInRetirement: v.yearsInRetirement!,
        monthlySpending: v.monthlySpending,
        monthlySaving: v.monthlySaving,
        birthDate: this.plan()?.ageFromHealth ? null : v.birthDate,
        today: todayIso(),
      })
      .subscribe({
        next: (plan) => {
          this.saving.set(false);
          this.show(plan);
          this.toast.success('Saved — every figure recalculated.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the assumptions.'));
        },
      });
  }

  private show(plan: FinancialPlan): void {
    this.plan.set(plan);
    const a = plan.assumptions;
    this.form.reset({
      expectedReturnPercent: a.expectedReturnPercent,
      inflationPercent: a.inflationPercent,
      retirementAge: a.retirementAge,
      yearsInRetirement: a.yearsInRetirement,
      monthlySpending: a.monthlySpending,
      monthlySaving: a.monthlySaving,
      birthDate: a.birthDate,
    });
  }
}
