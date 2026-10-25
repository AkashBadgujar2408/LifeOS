import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { Observable, catchError, of, switchMap } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import {
  FuelExpensePayload,
  FuelFill,
  FuelUnit,
  HomeService,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { formatMoney, heldCurrencies } from '../finance/finance-view';
import { FUEL_UNIT_SHORT } from './home-view';

export type FuelFillResult = { kind: 'saved'; fill: FuelFill } | { kind: 'deleted' };

/** What the dialog needs to know about the vehicle. */
export interface FuelFillVehicle {
  id: number;
  name: string;
  fuelUnit: FuelUnit;
  /** The last reading (prefills a new fill's odometer). */
  odometerKm: number | null;
  /** The currency of the last fill (else the base currency). */
  currency: string | null;
}

/** Adds (no `fill`) or edits a fill. Resolves null when closed without a change. */
export async function openFuelFill(
  modal: NgbModal,
  vehicle: FuelFillVehicle,
  fill?: FuelFill,
): Promise<FuelFillResult | null> {
  const modalRef = modal.open(FuelFillEditor, { ariaLabelledBy: 'fuel-fill-heading' });
  (modalRef.componentInstance as FuelFillEditor).configure(vehicle, fill);
  try {
    return (await modalRef.result) as FuelFillResult;
  } catch {
    return null;
  }
}

/**
 * One refuel: the day, the odometer, what was paid and the price per unit **or** the quantity (the server works out
 * the other). "Missed logging a fill before this" starts the average again. Paying from an account records one
 * Finance expense — on a new fill, or later on one that isn't in Finance yet; taking it back deletes that expense.
 */
@Component({
  selector: 'app-fuel-fill-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="fuel-fill-heading" class="modal-title h5">
          {{ fill() ? 'Fill' : 'Add a fill' }} — {{ vehicle()?.name }}
        </h2>
        <button type="button" class="btn-close" aria-label="Close" (click)="dismiss()"></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="fuel-on">Filled on</label>
            <div class="input-group">
              <input
                id="fuel-on"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('filledOn')"
                formControlName="filledOn"
                placeholder="e.g. 20/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #picker="ngbDatepicker"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="picker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('filledOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="fuel-odometer">Odometer (km)</label>
            <input
              id="fuel-odometer"
              type="number"
              min="0"
              step="1"
              class="form-control"
              [class.is-invalid]="fieldError('odometerKm')"
              formControlName="odometerKm"
              placeholder="e.g. 5300"
              ngbAutofocus
            />
            @if (fieldError('odometerKm'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-7">
            <label class="form-label" for="fuel-amount">Paid</label>
            <input
              id="fuel-amount"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 500"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-5">
            <label class="form-label" for="fuel-currency">Currency</label>
            <ng-select
              labelForId="fuel-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              [clearable]="false"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <fieldset>
          <legend class="form-label fs-6 mb-1">You know the</legend>
          <div class="btn-group btn-group-sm mb-2" role="group" aria-label="What you know">
            <input
              type="radio"
              class="btn-check"
              id="fuel-by-rate"
              value="rate"
              formControlName="by"
            />
            <label class="btn btn-outline-secondary" for="fuel-by-rate"
              >Price per {{ unit() }}</label
            >
            <input
              type="radio"
              class="btn-check"
              id="fuel-by-quantity"
              value="quantity"
              formControlName="by"
            />
            <label class="btn btn-outline-secondary" for="fuel-by-quantity">Quantity</label>
          </div>
          <label class="visually-hidden" for="fuel-value">
            {{
              form.controls.by.value === 'rate' ? 'Price per ' + unit() : 'Quantity in ' + unit()
            }}
          </label>
          <div class="input-group">
            <input
              id="fuel-value"
              type="number"
              min="0"
              step="0.001"
              class="form-control"
              [class.is-invalid]="fieldError('value')"
              formControlName="value"
              [placeholder]="form.controls.by.value === 'rate' ? 'e.g. 104.5' : 'e.g. 4.8'"
            />
            <span class="input-group-text">
              {{ form.controls.by.value === 'rate' ? '/ ' + unit() : unit() }}
            </span>
          </div>
          @if (fieldError('value'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          } @else if (workedOut(); as text) {
            <div class="form-text">{{ text }}</div>
          }
        </fieldset>
        <div class="form-check">
          <input
            id="fuel-missed"
            type="checkbox"
            class="form-check-input"
            formControlName="missedFillBefore"
          />
          <label class="form-check-label" for="fuel-missed">
            I missed logging a fill before this one
          </label>
          <div class="form-text">
            The average starts again from here, so a gap never inflates it.
          </div>
        </div>
        <div>
          <label class="form-label" for="fuel-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="fuel-notes"
            type="text"
            class="form-control"
            formControlName="notes"
            placeholder="e.g. HP pump on the highway"
          />
        </div>
        @if (fill()?.transactionId) {
          <p class="small mb-0">
            <i class="bi bi-check2-circle text-success" aria-hidden="true"></i>
            In Finance{{
              fill()?.paidFromAccountName ? ', paid from ' + fill()?.paidFromAccountName : ''
            }}.
            <button
              type="button"
              class="btn btn-link btn-sm p-0 align-baseline"
              (click)="takeBackExpense()"
            >
              Take the expense back
            </button>
          </p>
        } @else {
          <div>
            <label class="form-label" for="fuel-account">Paid from</label>
            <ng-select
              labelForId="fuel-account"
              formControlName="accountId"
              placeholder="Don't record it in Finance"
            >
              @for (a of payableAccounts(); track a.id) {
                <ng-option [value]="a.id">
                  {{ a.name }}
                </ng-option>
              }
            </ng-select>
            <div class="form-text">An account adds one expense to your ledger for this fill.</div>
          </div>
          @if (form.controls.accountId.value !== null) {
            @if (needsRate()) {
              <div>
                <label class="form-label" for="fuel-rate">
                  Rate to {{ baseCurrency() }}
                  <span class="text-body-secondary small"
                    >(1 {{ form.controls.currency.value }} =)</span
                  >
                </label>
                <input
                  id="fuel-rate"
                  type="number"
                  step="0.000001"
                  min="0"
                  class="form-control"
                  [class.is-invalid]="fieldError('exchangeRate')"
                  formControlName="exchangeRate"
                  placeholder="e.g. 84"
                />
                @if (fieldError('exchangeRate'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
            }
            <div>
              <span class="form-label d-block">Categories for the expense</span>
              <app-tag-picker
                [selectedTagIds]="tagIds()"
                (selectedTagIdsChange)="tagIds.set($event)"
              />
            </div>
          }
        }
      </div>
      <div class="modal-footer">
        @if (fill()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="dismiss()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class FuelFillEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly vehicle = signal<FuelFillVehicle | null>(null);
  protected readonly fill = signal<FuelFill | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);
  /** The expense was taken back while the dialog was open: the list needs a reload even on Cancel. */
  private changed = false;

  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly baseCurrency = computed(() => this.settingsService.settings()?.baseCurrency);

  protected readonly form = this.fb.group({
    filledOn: this.fb.control<string | null>(todayIso(), Validators.required),
    odometerKm: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(10_000_000),
    ]),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control('', Validators.required),
    by: this.fb.nonNullable.control<'rate' | 'quantity'>('rate'),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.001)]),
    missedFillBefore: this.fb.nonNullable.control(false),
    notes: this.fb.nonNullable.control('', Validators.maxLength(500)),
    accountId: this.fb.control<number | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.000001)),
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly unit = computed(() => FUEL_UNIT_SHORT[this.vehicle()?.fuelUnit ?? 'Litre']);

  /** Open accounts that hold the fill's currency. */
  protected readonly payableAccounts = computed(() => {
    const currency = this.formValue().currency;
    return this.accounts().filter(
      (a) => !a.isArchived && (!currency || heldCurrencies(a).includes(currency)),
    );
  });

  protected readonly needsRate = computed(() => {
    const currency = this.formValue().currency;
    return !!currency && !!this.baseCurrency() && currency !== this.baseCurrency();
  });

  /** "That's 4.81 L." / "That's ₹104.00 per L." — the other half, as the server will work it out. */
  protected readonly workedOut = computed(() => {
    const v = this.formValue();
    if (!v.amount || !v.value || v.amount <= 0 || v.value <= 0) {
      return null;
    }
    const unit = this.unit();
    if (v.by === 'rate') {
      const quantity = v.amount / v.value;
      return `That's ${quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}.`;
    }
    return v.currency ? `That's ${formatMoney(v.amount / v.value, v.currency)} per ${unit}.` : null;
  });

  configure(vehicle: FuelFillVehicle, fill?: FuelFill): void {
    this.vehicle.set(vehicle);
    this.fill.set(fill ?? null);
    this.form.reset({
      filledOn: fill?.filledOn ?? todayIso(),
      odometerKm: fill?.odometerKm ?? vehicle.odometerKm,
      amount: fill?.amount ?? null,
      currency:
        fill?.currency ??
        vehicle.currency ??
        this.settingsService.settings()?.baseCurrency ??
        'INR',
      by: fill?.quantityGiven ? 'quantity' : 'rate',
      value: fill ? (fill.quantityGiven ? fill.quantity : fill.pricePerUnit) : null,
      missedFillBefore: fill?.missedFillBefore ?? false,
      notes: fill?.notes ?? '',
      accountId: null,
      exchangeRate: null,
    });
  }

  protected fieldError(
    name: 'filledOn' | 'odometerKm' | 'amount' | 'currency' | 'value' | 'exchangeRate',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'filledOn':
        return control.errors['required']
          ? 'Say when you filled up.'
          : control.errors['future']
            ? 'That can’t be in the future.'
            : dateFieldError(control.errors);
      case 'odometerKm':
        return control.errors['required'] ? 'Give the odometer reading.' : 'That isn’t a reading.';
      case 'amount':
        return 'Give what you paid (more than zero).';
      case 'currency':
        return 'Choose the currency.';
      case 'value':
        return this.form.controls.by.value === 'rate'
          ? 'Give the price per unit (more than zero).'
          : 'Give the quantity (more than zero).';
      case 'exchangeRate':
        return 'Give the rate — or don’t record it in Finance.';
    }
  }

  protected submit(): void {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return;
    }
    this.form.controls.filledOn.updateValueAndValidity();
    this.form.controls.exchangeRate.updateValueAndValidity();
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.filledOn && v.filledOn > today) {
      this.form.controls.filledOn.setErrors({ future: true });
    }
    const recording = !this.fill()?.transactionId && v.accountId !== null;
    if (recording && this.needsRate() && v.exchangeRate === null) {
      this.form.controls.exchangeRate.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const expense: FuelExpensePayload | null = recording
      ? {
          accountId: v.accountId!,
          exchangeRate: this.needsRate() ? v.exchangeRate : null,
          tagIds: this.tagIds(),
        }
      : null;
    const existing = this.fill();
    this.saving.set(true);
    const save = this.homeService.saveFuelFill(vehicle.id, existing?.id ?? null, {
      filledOn: v.filledOn!,
      odometerKm: v.odometerKm!,
      amount: v.amount!,
      currency: v.currency,
      pricePerUnit: v.by === 'rate' ? v.value : null,
      quantity: v.by === 'quantity' ? v.value : null,
      missedFillBefore: v.missedFillBefore,
      notes: v.notes.trim() || null,
      expense: existing ? null : expense,
      today,
    });
    // An existing fill not yet in Finance is saved first, then recorded.
    const request: Observable<FuelFill> =
      existing && expense
        ? save.pipe(
            switchMap((saved) => this.homeService.recordFuelExpense(vehicle.id, saved.id, expense)),
          )
        : save;
    request.subscribe({
      next: (fill) => this.activeModal.close({ kind: 'saved', fill }),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the fill.'));
      },
    });
  }

  protected async takeBackExpense(): Promise<void> {
    const vehicle = this.vehicle();
    const fill = this.fill();
    if (!vehicle || !fill) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Take the expense back?',
      text: 'The expense this fill created is deleted from your ledger. The fill stays logged.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Take it back',
      confirmButtonColor: 'var(--lifeos-teal-strong)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.homeService.removeFuelExpense(vehicle.id, fill.id).subscribe({
      next: (updated) => {
        this.fill.set(updated);
        this.changed = true;
        this.toast.success('Expense taken back.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take the expense back.')),
    });
  }

  protected async remove(): Promise<void> {
    const vehicle = this.vehicle();
    const fill = this.fill();
    if (!vehicle || !fill) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Delete this fill?',
      text: fill.transactionId
        ? 'The expense it created in Finance is deleted too.'
        : 'The mileage is worked out again without it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.homeService.removeFuelFill(vehicle.id, fill.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the fill.')),
    });
  }

  /** Cancel after taking an expense back still counts as a change. */
  protected dismiss(): void {
    const fill = this.fill();
    if (this.changed && fill) {
      this.activeModal.close({ kind: 'saved', fill });
    } else {
      this.activeModal.dismiss();
    }
  }
}
