import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ExchangeRate, FinanceService } from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { currentRates } from './finance-view';

/**
 * The exchange-rate master, on the Settings page under the base currency: "1 GBP = 110.00 INR from 1 Oct". Rates
 * keep their history (a past month end converts at the rate of the time) and convert other-currency accounts,
 * investments and loans into the base currency for totals, net worth and savings, and prefill a transaction's rate.
 * A transaction keeps the rate it was entered with.
 */
@Component({
  selector: 'app-exchange-rates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    DatePipe,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    @if (base(); as base) {
      <p class="small text-body-secondary">
        How much one unit of another currency is worth in {{ base }} — used to show those accounts,
        investments and loans in {{ base }} (totals, net worth, savings goals) and to fill in a new
        transaction's rate. Set a new rate when it moves; older ones stay for the months they
        covered.
      </p>

      @if (loadFailed()) {
        <p class="small text-body-secondary">
          Couldn't load your rates.
          <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
            Try again
          </button>
        </p>
      } @else if (grouped().length > 0) {
        <ul class="list-group mb-3">
          @for (g of grouped(); track g.currency) {
            <li class="list-group-item">
              <div class="d-flex flex-wrap justify-content-between gap-2">
                <span class="fw-semibold">
                  1 {{ g.currency }} =
                  @if (g.current; as c) {
                    {{ c.rate }} {{ base }}
                    <span class="small text-body-secondary fw-normal"
                      >since {{ c.effectiveOn | date }}</span
                    >
                  } @else {
                    <span class="text-body-secondary fw-normal">no rate in force yet</span>
                  }
                </span>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0"
                  (click)="startNew(g.currency)"
                >
                  New rate
                </button>
              </div>
              @if (g.history.length > 1 || (g.history.length === 1 && !g.current)) {
                <details class="small mt-1">
                  <summary class="text-body-secondary">History</summary>
                  <ul class="list-unstyled mb-0 mt-1">
                    @for (r of g.history; track r.id) {
                      <li class="d-flex justify-content-between gap-2">
                        <span>{{ r.effectiveOn | date }} · {{ r.rate }}</span>
                        <button
                          type="button"
                          class="btn btn-link btn-sm p-0 link-secondary"
                          [attr.aria-label]="
                            'Remove the ' + r.currency + ' rate from ' + (r.effectiveOn | date)
                          "
                          (click)="remove(r)"
                        >
                          <i class="bi bi-x-lg"></i>
                        </button>
                      </li>
                    }
                  </ul>
                </details>
              } @else if (g.current; as c) {
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 link-secondary small"
                  (click)="remove(c)"
                >
                  Remove
                </button>
              }
            </li>
          }
        </ul>
      }

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="row g-2 align-items-start">
        <div class="col-sm-4">
          <label class="form-label small" for="rate-currency">Currency</label>
          <ng-select
            labelForId="rate-currency"
            class="ng-select-sm"
            [class.is-invalid]="fieldError('currency')"
            formControlName="currency"
            placeholder="Choose a currency"
            [clearable]="false"
          >
            @for (c of choices(); track c.code) {
              <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
            }
          </ng-select>
          @if (fieldError('currency'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="col-sm-3">
          <label class="form-label small" for="rate-value">1 unit = ? {{ base }}</label>
          <input
            id="rate-value"
            type="number"
            step="any"
            min="0"
            class="form-control form-control-sm"
            [class.is-invalid]="fieldError('rate')"
            formControlName="rate"
            placeholder="e.g. 110.25"
          />
          @if (fieldError('rate'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="col-sm-3">
          <label class="form-label small" for="rate-from">From</label>
          <div class="input-group input-group-sm">
            <input
              id="rate-from"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('effectiveOn')"
              formControlName="effectiveOn"
              placeholder="e.g. 01/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #fromPicker="ngbDatepicker"
              [minDate]="minDate"
              [maxDate]="maxDate"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day the rate applies from"
              (click)="fromPicker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fieldError('effectiveOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="col-sm-2">
          <span class="form-label small d-block">&nbsp;</span>
          <button type="submit" class="btn btn-sm btn-primary w-100" [disabled]="saving()">
            Save rate
          </button>
        </div>
      </form>
    } @else {
      <p class="small text-body-secondary mb-0">
        Choose a base currency above first — rates convert into it.
      </p>
    }
  `,
})
export class ExchangeRates {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly base = computed(() => this.settingsService.settings()?.baseCurrency ?? null);
  private readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly choices = computed(() =>
    this.currencies().filter((c) => c.code !== this.base()),
  );
  protected readonly rates = signal<ExchangeRate[]>([]);
  protected readonly grouped = computed(() => currentRates(this.rates(), todayIso()));
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly form = this.fb.group({
    currency: this.fb.nonNullable.control('', Validators.required),
    rate: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.00000001)]),
    effectiveOn: this.fb.control<string | null>(todayIso(), Validators.required),
  });

  constructor() {
    // Rates belong to a base currency: changing it (just above on the same page) shows that base's rates.
    effect(() => {
      this.base();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    if (!this.base()) {
      this.rates.set([]);
      return;
    }
    this.financeService.rates().subscribe({
      next: (rates) => {
        this.rates.set(rates);
        this.loadFailed.set(false);
      },
      error: () => this.loadFailed.set(true),
    });
  }

  protected startNew(currency: string): void {
    this.form.reset({ currency, rate: null, effectiveOn: todayIso() });
    document.getElementById('rate-value')?.focus();
  }

  protected fieldError(name: 'currency' | 'rate' | 'effectiveOn'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'currency':
        return 'Choose the currency.';
      case 'rate':
        return control.errors['required'] ? 'Enter the rate.' : 'Has to be more than zero.';
      default:
        return control.errors['required'] ? 'Say from which day.' : dateFieldError(control.errors);
    }
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.financeService.setRate(v.currency, v.rate!, v.effectiveOn!).subscribe({
      next: (rates) => {
        this.saving.set(false);
        this.rates.set(rates);
        this.toast.success(`1 ${v.currency} = ${v.rate} ${this.base()} saved.`);
        this.form.reset({ currency: '', rate: null, effectiveOn: todayIso() });
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the rate.'));
      },
    });
  }

  protected remove(rate: ExchangeRate): void {
    this.financeService.removeRate(rate.id).subscribe({
      next: (rates) => this.rates.set(rates),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the rate.')),
    });
  }
}
