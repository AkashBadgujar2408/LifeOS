import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import { BILL_KINDS, BillKind, HomeService, UtilityBill } from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { formatMoney } from '../finance/finance-view';
import { BILL_KIND_LABELS } from './home-view';

export type BillEditorResult = { kind: 'saved'; bill: UtilityBill } | { kind: 'deleted' };

/** Opens a bill (new when missing, optionally copying an earlier one's kind/provider/property). */
export async function openBillEditor(
  modal: NgbModal,
  bill?: UtilityBill,
  like?: UtilityBill,
): Promise<BillEditorResult | null> {
  const modalRef = modal.open(BillEditor, { ariaLabelledBy: 'bill-editor-heading', size: 'lg' });
  (modalRef.componentInstance as BillEditor).configure(bill, like);
  try {
    return (await modalRef.result) as BillEditorResult;
  } catch {
    return null;
  }
}

const dateFields = [
  { name: 'periodStart', label: 'Period from', placeholder: 'e.g. 01/Sep/2026' },
  { name: 'periodEnd', label: 'to', placeholder: 'e.g. 30/Sep/2026' },
  { name: 'dueOn', label: 'Due on', placeholder: 'e.g. 25/Oct/2026' },
] as const;

/** A bill: what for, which period, when it's due, how much — and, once saved, the bill PDF linked. */
@Component({
  selector: 'app-bill-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    DatePipe,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="bill-editor-heading" class="modal-title h5">
          {{ bill() ? 'Edit bill' : 'Add a bill' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (bill()?.paidOn; as paidOn) {
          <div class="alert alert-secondary small mb-0">
            Paid {{ paidOn | date }}
            @if (bill()!.paidFromAccountName) {
              from {{ bill()!.paidFromAccountName }} — the amount can only change once the payment
              is taken back.
            }
          </div>
        }
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="bill-kind">For</label>
            <select id="bill-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="bill-provider">
              Provider <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="bill-provider"
              type="text"
              class="form-control"
              formControlName="provider"
              placeholder="e.g. MSEDCL, Airtel"
              autocomplete="off"
              ngbAutofocus
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="bill-property">Property</label>
            <ng-select
              labelForId="bill-property"
              formControlName="propertyId"
              placeholder="Pick a property (optional)"
            >
              @for (p of properties(); track p.id) {
                <ng-option [value]="p.id">
                  {{ p.name }}
                </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-4">
              <label class="form-label" [for]="'bill-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'bill-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="'Pick ' + d.label.toLowerCase()"
                  (click)="picker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError(d.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="bill-amount">Amount</label>
            <input
              id="bill-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 1840"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="bill-currency">Currency</label>
            <ng-select
              labelForId="bill-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="Choose a currency"
              [clearable]="false"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="bill-units">
              Units used <span class="text-body-secondary small">(kWh, litres…)</span>
            </label>
            <input
              id="bill-units"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('unitsUsed')"
              formControlName="unitsUsed"
              placeholder="e.g. 212"
            />
            @if (fieldError('unitsUsed'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="bill-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="bill-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Consumer number, why it was high"
          ></textarea>
        </div>
        @if (bill(); as b) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">Link the bill itself (from Documents).</p>
            <app-linked-items entityType="UtilityBill" [entityId]="b.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="UtilityBill"
              [entityId]="b.id"
              [entityTitle]="(b.provider ?? kindLabels[b.kind]) + ' bill'"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (bill()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class BillEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = BILL_KINDS;
  protected readonly kindLabels = BILL_KIND_LABELS;
  protected readonly dateFields = dateFields;
  protected readonly minDate = { year: 2000, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 2, month: 12, day: 31 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly properties = toSignal(
    this.homeService.properties().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly bill = signal<UtilityBill | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<BillKind>('Electricity'),
    provider: this.fb.nonNullable.control('', Validators.maxLength(200)),
    propertyId: this.fb.control<number | null>(null),
    periodStart: this.fb.control<string | null>(null),
    periodEnd: this.fb.control<string | null>(null),
    dueOn: this.fb.control<string | null>(null, Validators.required),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control('', Validators.required),
    unitsUsed: this.fb.control<number | null>(null, Validators.min(0)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(bill?: UtilityBill, like?: UtilityBill): void {
    this.bill.set(bill ?? null);
    const from = bill ?? like;
    this.form.reset({
      kind: from?.kind ?? 'Electricity',
      provider: from?.provider ?? '',
      propertyId: from?.propertyId ?? null,
      periodStart: bill?.periodStart ?? null,
      periodEnd: bill?.periodEnd ?? null,
      dueOn: bill?.dueOn ?? null,
      amount: bill?.amount ?? null,
      currency: from?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      unitsUsed: bill?.unitsUsed ?? null,
      notes: bill?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'periodStart' | 'periodEnd' | 'dueOn' | 'amount' | 'currency' | 'unitsUsed',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'dueOn':
        return control.errors['required'] ? 'Say when it’s due.' : dateFieldError(control.errors);
      case 'periodEnd':
        return control.errors['order']
          ? 'The period can’t end before it starts.'
          : dateFieldError(control.errors);
      case 'amount':
        return control.errors['required'] ? 'How much is it?' : 'Has to be more than zero.';
      case 'currency':
        return 'Choose the bill’s currency.';
      case 'unitsUsed':
        return 'Can’t be negative.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    this.form.controls.periodEnd.updateValueAndValidity();
    const v = this.form.getRawValue();
    if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart) {
      this.form.controls.periodEnd.setErrors({ order: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .saveBill(this.bill()?.id ?? null, {
        propertyId: v.propertyId,
        kind: v.kind,
        provider: v.provider.trim() || null,
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        dueOn: v.dueOn!,
        amount: v.amount!,
        currency: v.currency,
        unitsUsed: v.unitsUsed,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: (bill) => this.activeModal.close({ kind: 'saved', bill }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the bill.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const bill = this.bill();
    if (!bill) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this bill?',
      text: bill.transactionId
        ? 'The expense it was paid with stays in Finance.'
        : 'Its links and reminders go too.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeBill(bill.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the bill.')),
    });
  }
}

/** Opens "Pay" for a bill; resolves with the paid bill, or null if dismissed. */
export async function openBillPay(modal: NgbModal, bill: UtilityBill): Promise<UtilityBill | null> {
  const modalRef = modal.open(BillPay, { ariaLabelledBy: 'bill-pay-heading' });
  (modalRef.componentInstance as BillPay).configure(bill);
  try {
    return (await modalRef.result) as UtilityBill;
  } catch {
    return null;
  }
}

/**
 * Paying a bill: the day and — to record it in Finance — the account it left from (one expense, made by the server;
 * the bill can't be recorded twice). Another currency than the base one needs the rate, as any transaction does.
 */
@Component({
  selector: 'app-bill-pay',
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
        <h2 id="bill-pay-heading" class="modal-title h5">
          Pay {{ money(bill()?.amount ?? 0, bill()?.currency ?? 'INR') }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div>
          <label class="form-label" for="pay-on">Paid on</label>
          <div class="input-group">
            <input
              id="pay-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('paidOn')"
              formControlName="paidOn"
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
          @if (fieldError('paidOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="pay-account">Paid from</label>
          <ng-select
            labelForId="pay-account"
            formControlName="accountId"
            placeholder="Don't record it in Finance"
          >
            @for (a of accounts(); track a.id) {
              <ng-option [value]="a.id"> {{ a.name }} ({{ a.currency }}) </ng-option>
            }
          </ng-select>
          <div class="form-text">An account adds one expense to your ledger for this bill.</div>
        </div>
        @if (form.controls.accountId.value !== null) {
          @if (needsRate()) {
            <div>
              <label class="form-label" for="pay-rate">
                Rate to {{ baseCurrency() }}
                <span class="text-body-secondary small">(1 {{ bill()?.currency }} =)</span>
              </label>
              <input
                id="pay-rate"
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
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Mark paid</button>
      </div>
    </form>
  `,
})
export class BillPay {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly money = formatMoney;
  protected readonly bill = signal<UtilityBill | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);
  protected readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly baseCurrency = computed(() => this.settingsService.settings()?.baseCurrency);
  protected readonly needsRate = computed(
    () => !!this.bill() && !!this.baseCurrency() && this.bill()!.currency !== this.baseCurrency(),
  );

  protected readonly form = this.fb.group({
    paidOn: this.fb.control<string | null>(todayIso(), Validators.required),
    accountId: this.fb.control<number | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.000001)),
  });

  configure(bill: UtilityBill): void {
    this.bill.set(bill);
  }

  protected fieldError(name: 'paidOn' | 'exchangeRate'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return name === 'exchangeRate'
      ? 'Give the rate — or don’t record it in Finance.'
      : control.errors['required']
        ? 'Say when it was paid.'
        : control.errors['future']
          ? 'It can’t be paid in the future.'
          : dateFieldError(control.errors);
  }

  protected submit(): void {
    const bill = this.bill();
    if (!bill) {
      return;
    }
    this.form.controls.paidOn.updateValueAndValidity();
    this.form.controls.exchangeRate.updateValueAndValidity();
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.paidOn && v.paidOn > today) {
      this.form.controls.paidOn.setErrors({ future: true });
    }
    if (v.accountId !== null && this.needsRate() && v.exchangeRate === null) {
      this.form.controls.exchangeRate.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .payBill(bill.id, {
        paidOn: v.paidOn!,
        accountId: v.accountId,
        exchangeRate: v.accountId !== null && this.needsRate() ? v.exchangeRate : null,
        tagIds: v.accountId !== null ? this.tagIds() : [],
        today,
      })
      .subscribe({
        next: (paid) => this.activeModal.close(paid),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not mark it paid.'));
        },
      });
  }
}
