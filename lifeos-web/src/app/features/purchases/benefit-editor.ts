import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, map, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import {
  BENEFIT_KINDS,
  Benefit,
  BenefitDetail,
  BenefitKind,
  PurchasesService,
} from '../../core/services/purchases.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { heldCurrencies } from '../finance/finance-view';
import { BENEFIT_KIND_LABELS } from './purchases-view';

/** Opens a reward (new when missing; pass the detail read so the code and PIN are there). */
export async function openBenefitEditor(
  modal: NgbModal,
  benefit?: Benefit,
): Promise<BenefitDetail | null> {
  const modalRef = modal.open(BenefitEditor, {
    ariaLabelledBy: 'benefit-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as BenefitEditor).configure(benefit);
  try {
    return (await modalRef.result) as BenefitDetail;
  } catch {
    return null;
  }
}

const MONEY_KINDS: readonly BenefitKind[] = ['Voucher', 'GiftCard', 'StoreCredit', 'WalletCredit'];
const BUYABLE_KINDS: readonly BenefitKind[] = ['Voucher', 'GiftCard', 'StoreCredit'];
const CODED_KINDS: readonly BenefitKind[] = ['Voucher', 'GiftCard', 'StoreCredit', 'Coupon'];

/**
 * A reward: what kind, where it works, what it's worth, its code and PIN (encrypted where they're stored), when it
 * runs out and how early to be reminded. A voucher or gift card you paid for can record that purchase in Finance.
 */
@Component({
  selector: 'app-benefit-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="benefit-editor-heading" class="modal-title h5">
          {{ benefit() ? 'Edit reward' : 'Add a reward' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-5">
            <label class="form-label" for="benefit-kind">Kind</label>
            <select id="benefit-kind" class="form-select" formControlName="kind">
              @for (k of kinds; track k) {
                <option [ngValue]="k" [selected]="k === form.controls.kind.value">
                  {{ kindLabels[k] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-7">
            <label class="form-label" for="benefit-name">Name</label>
            <input
              id="benefit-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Amazon gift card"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-5">
            <label class="form-label" for="benefit-store">
              {{ kind() === 'Points' ? 'Programme' : 'Store' }}
              @if (kind() !== 'Points') {
                <span class="text-body-secondary small">(blank: anywhere)</span>
              }
            </label>
            <input
              id="benefit-store"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('store')"
              formControlName="store"
              [placeholder]="kind() === 'Points' ? 'e.g. Air India' : 'e.g. Amazon'"
              autocomplete="off"
            />
            @if (fieldError('store'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          @if (kind() === 'Coupon') {
            <div class="col-sm-7">
              <span class="form-label d-block">Takes off</span>
              <div class="input-group">
                <div class="btn-group" role="group" aria-label="Percent or amount">
                  <input
                    type="radio"
                    class="btn-check"
                    id="benefit-off-percent"
                    value="percent"
                    formControlName="couponBy"
                  />
                  <label class="btn btn-outline-secondary" for="benefit-off-percent">%</label>
                  <input
                    type="radio"
                    class="btn-check"
                    id="benefit-off-flat"
                    value="flat"
                    formControlName="couponBy"
                  />
                  <label class="btn btn-outline-secondary" for="benefit-off-flat">Amount</label>
                </div>
                <label class="visually-hidden" for="benefit-off">How much off</label>
                <input
                  id="benefit-off"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  [class.is-invalid]="fieldError('off')"
                  formControlName="off"
                  [placeholder]="
                    form.controls.couponBy.value === 'percent' ? 'e.g. 10' : 'e.g. 200'
                  "
                />
              </div>
              @if (fieldError('off'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          } @else if (kind() === 'Points') {
            <div class="col-sm-7">
              <label class="form-label" for="benefit-per-point">One point is worth</label>
              <input
                id="benefit-per-point"
                type="number"
                min="0"
                step="0.0001"
                class="form-control"
                [class.is-invalid]="fieldError('valuePerPoint')"
                formControlName="valuePerPoint"
                placeholder="e.g. 0.5"
              />
              @if (fieldError('valuePerPoint'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          } @else {
            <div class="col-sm-7">
              <label class="form-label" for="benefit-value">
                {{ kind() === 'Cashback' ? 'Cashback expected' : 'Value' }}
              </label>
              <input
                id="benefit-value"
                type="number"
                min="0"
                step="0.01"
                class="form-control"
                [class.is-invalid]="fieldError('value')"
                formControlName="value"
                placeholder="e.g. 500"
              />
              @if (fieldError('value'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="benefit-currency">Currency</label>
            <ng-select labelForId="benefit-currency" formControlName="currency" [clearable]="false">
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
          </div>
          @if (kind() === 'Coupon') {
            <div class="col-sm-4">
              <label class="form-label" for="benefit-min">
                Minimum spend <span class="text-body-secondary small">(optional)</span>
              </label>
              <input
                id="benefit-min"
                type="number"
                min="0"
                step="0.01"
                class="form-control"
                [class.is-invalid]="fieldError('minSpend')"
                formControlName="minSpend"
                placeholder="e.g. 1000"
              />
              @if (fieldError('minSpend'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
          @if (kind() === 'WalletCredit') {
            <div class="col-sm-8">
              <label class="form-label" for="benefit-wallet">In the wallet</label>
              <ng-select
                labelForId="benefit-wallet"
                [class.is-invalid]="fieldError('accountId')"
                formControlName="accountId"
                placeholder="Choose…"
              >
                @for (a of accounts(); track a.id) {
                  <ng-option [value]="a.id">
                    {{ a.name }}
                  </ng-option>
                }
              </ng-select>
              @if (fieldError('accountId'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        @if (coded()) {
          <div class="row g-3">
            <div class="col-sm-8">
              <label class="form-label" for="benefit-code">
                Code <span class="text-body-secondary small">(kept encrypted)</span>
              </label>
              <div class="input-group">
                <input
                  id="benefit-code"
                  [type]="showSecrets() ? 'text' : 'password'"
                  class="form-control font-monospace"
                  formControlName="code"
                  placeholder="As printed on the card"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="
                    showSecrets() ? 'Hide the code and PIN' : 'Show the code and PIN'
                  "
                  (click)="showSecrets.set(!showSecrets())"
                >
                  <i
                    class="bi"
                    [class.bi-eye]="!showSecrets()"
                    [class.bi-eye-slash]="showSecrets()"
                  ></i>
                </button>
              </div>
            </div>
            <div class="col-sm-4">
              <label class="form-label" for="benefit-pin">
                PIN <span class="text-body-secondary small">(optional)</span>
              </label>
              <input
                id="benefit-pin"
                [type]="showSecrets() ? 'text' : 'password'"
                class="form-control font-monospace"
                formControlName="pin"
                placeholder="e.g. 4 digits"
                autocomplete="off"
              />
            </div>
          </div>
        }
        <div class="row g-3">
          @if (kind() === 'Cashback') {
            <div class="col-sm-6">
              <label class="form-label" for="benefit-expected">Expected by</label>
              <div class="input-group">
                <input
                  id="benefit-expected"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('expectedBy')"
                  formControlName="expectedBy"
                  placeholder="e.g. 15/Nov/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #expectedPicker="ngbDatepicker"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick the day it's expected"
                  (click)="expectedPicker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('expectedBy'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          } @else {
            <div class="col-sm-6">
              <label class="form-label" for="benefit-expires">
                {{ kind() === 'Points' ? 'Programme ends' : 'Runs out on' }}
                <span class="text-body-secondary small">(optional)</span>
              </label>
              <div class="input-group">
                <input
                  id="benefit-expires"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('expiresOn')"
                  formControlName="expiresOn"
                  placeholder="e.g. 31/Dec/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #expiresPicker="ngbDatepicker"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick the day it runs out"
                  (click)="expiresPicker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('expiresOn'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div class="col-sm-6">
              <label class="form-label" for="benefit-remind">Remind me</label>
              <div class="input-group">
                <input
                  id="benefit-remind"
                  type="number"
                  min="0"
                  max="365"
                  class="form-control"
                  [class.is-invalid]="fieldError('reminderDays')"
                  formControlName="reminderDays"
                  placeholder="Blank: no reminder"
                />
                <span class="input-group-text">days before</span>
              </div>
              @if (fieldError('reminderDays'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              } @else if (kind() === 'Points') {
                <div class="form-text">Before the next batch of points runs out.</div>
              }
            </div>
          }
        </div>
        @if (!benefit() && buyable()) {
          <div>
            <label class="form-label" for="benefit-bought">Paid for it from</label>
            <ng-select
              labelForId="benefit-bought"
              formControlName="boughtAccountId"
              placeholder="It was a gift / free — no purchase"
            >
              @for (a of payableAccounts(); track a.id) {
                <ng-option [value]="a.id">
                  {{ a.name }}
                </ng-option>
              }
            </ng-select>
            <div class="form-text">
              An account records it as a purchase today, with one expense in Finance.
            </div>
            @if (fieldError('boughtAccountId'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <div>
          <label class="form-label" for="benefit-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="benefit-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Terms, where it came from"
          ></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class BenefitEditor {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = BENEFIT_KINDS;
  protected readonly kindLabels = BENEFIT_KIND_LABELS;
  protected readonly benefit = signal<Benefit | null>(null);
  protected readonly saving = signal(false);
  protected readonly showSecrets = signal(false);
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(
        map((accounts) => accounts.filter((a) => !a.isArchived)),
        catchError(() => of([])),
      ),
    { initialValue: [] },
  );

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<BenefitKind>('Voucher'),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    store: this.fb.nonNullable.control('', Validators.maxLength(200)),
    value: this.fb.control<number | null>(null, Validators.min(0.01)),
    currency: this.fb.nonNullable.control(''),
    couponBy: this.fb.nonNullable.control<'percent' | 'flat'>('percent'),
    off: this.fb.control<number | null>(null, Validators.min(0.01)),
    minSpend: this.fb.control<number | null>(null, Validators.min(0.01)),
    valuePerPoint: this.fb.control<number | null>(null, Validators.min(0.000001)),
    accountId: this.fb.control<number | null>(null),
    code: this.fb.nonNullable.control('', Validators.maxLength(200)),
    pin: this.fb.nonNullable.control('', Validators.maxLength(50)),
    expiresOn: this.fb.control<string | null>(null),
    expectedBy: this.fb.control<string | null>(null),
    reminderDays: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(365)]),
    boughtAccountId: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  protected readonly kind = toSignal(this.form.controls.kind.valueChanges, {
    initialValue: 'Voucher' as BenefitKind,
  });
  private readonly currency = toSignal(this.form.controls.currency.valueChanges, {
    initialValue: '',
  });
  protected readonly coded = computed(() => CODED_KINDS.includes(this.kind()));
  protected readonly buyable = computed(() => BUYABLE_KINDS.includes(this.kind()));
  protected readonly payableAccounts = computed(() =>
    this.accounts().filter((a) => !this.currency() || heldCurrencies(a).includes(this.currency())),
  );

  configure(benefit?: Benefit): void {
    this.benefit.set(benefit ?? null);
    this.form.reset({
      kind: benefit?.kind ?? 'Voucher',
      name: benefit?.name ?? '',
      store: benefit?.store ?? '',
      value: benefit?.kind === 'Coupon' ? null : (benefit?.value ?? null),
      currency: benefit?.currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR',
      couponBy: benefit?.kind === 'Coupon' && benefit.value !== null ? 'flat' : 'percent',
      off: benefit?.kind === 'Coupon' ? (benefit.discountPercent ?? benefit.value) : null,
      minSpend: benefit?.minSpend ?? null,
      valuePerPoint: benefit?.valuePerPoint ?? null,
      accountId: benefit?.accountId ?? null,
      code: benefit?.code ?? '',
      pin: benefit?.pin ?? '',
      expiresOn: benefit?.expiresOn ?? null,
      expectedBy: benefit?.expectedBy ?? null,
      reminderDays: benefit?.reminderDays ?? null,
      boughtAccountId: null,
      notes: benefit?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'store'
      | 'value'
      | 'off'
      | 'minSpend'
      | 'valuePerPoint'
      | 'accountId'
      | 'expiresOn'
      | 'expectedBy'
      | 'reminderDays'
      | 'boughtAccountId',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required']
          ? 'Name it (e.g. Amazon gift card).'
          : 'That is too long.';
      case 'store':
        return 'Name the programme (e.g. Air India).';
      case 'value':
        return control.errors['required'] ? 'Give its value.' : 'Has to be more than zero.';
      case 'off':
        return control.errors['required']
          ? 'Say how much it takes off.'
          : control.errors['percent']
            ? 'A % between 0 and 100.'
            : 'Has to be more than zero.';
      case 'minSpend':
        return 'Has to be more than zero.';
      case 'valuePerPoint':
        return control.errors['required']
          ? 'Give what one point is worth.'
          : 'Has to be more than zero.';
      case 'accountId':
        return 'Choose the wallet it’s in.';
      case 'reminderDays':
        return control.errors['day'] ? 'Reminders need a day it runs out.' : '0 to 365 days.';
      case 'boughtAccountId':
        return 'Give its value to record what you paid.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    const kind = v.kind;
    const c = this.form.controls;
    for (const control of [c.value, c.off, c.valuePerPoint, c.store, c.accountId, c.reminderDays]) {
      control.updateValueAndValidity();
    }
    // What each kind needs (the server checks the same).
    if ((MONEY_KINDS.includes(kind) || kind === 'Cashback') && v.value === null) {
      c.value.setErrors({ required: true });
    }
    if (kind === 'Coupon' && v.off === null) {
      c.off.setErrors({ required: true });
    } else if (kind === 'Coupon' && v.couponBy === 'percent' && v.off! > 100) {
      c.off.setErrors({ percent: true });
    }
    if (kind === 'Points' && v.valuePerPoint === null) {
      c.valuePerPoint.setErrors({ required: true });
    }
    if (kind === 'Points' && !v.store.trim()) {
      c.store.setErrors({ required: true });
    }
    if (kind === 'WalletCredit' && v.accountId === null) {
      c.accountId.setErrors({ required: true });
    }
    if (v.reminderDays !== null && !v.expiresOn && kind !== 'Points' && kind !== 'Cashback') {
      c.reminderDays.setErrors({ day: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const coupon = kind === 'Coupon';
    const value = coupon
      ? v.couponBy === 'flat'
        ? v.off
        : null
      : kind === 'Points'
        ? null
        : v.value;
    const minSpend = coupon ? v.minSpend : null;
    const existing = this.benefit();
    this.saving.set(true);
    this.purchasesService
      .saveBenefit(existing?.id ?? null, {
        kind,
        name: v.name,
        store: v.store.trim() || null,
        value,
        currency: value !== null || minSpend !== null || kind === 'Points' ? v.currency : null,
        discountPercent: coupon && v.couponBy === 'percent' ? v.off : null,
        minSpend,
        valuePerPoint: kind === 'Points' ? v.valuePerPoint : null,
        code: this.coded() ? v.code.trim() || null : null,
        pin: this.coded() ? v.pin.trim() || null : null,
        expiresOn: kind === 'Cashback' ? null : v.expiresOn,
        reminderDays: kind === 'Cashback' ? null : v.reminderDays,
        purchaseId: existing?.purchaseId ?? null,
        accountId: kind === 'WalletCredit' ? v.accountId : null,
        expectedBy: kind === 'Cashback' ? v.expectedBy : null,
        notes: v.notes.trim() || null,
        bought:
          !existing && this.buyable() && v.boughtAccountId !== null
            ? { accountId: v.boughtAccountId, exchangeRate: null }
            : null,
        today: todayIso(),
      })
      .subscribe({
        next: (detail) => this.activeModal.close(detail),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the reward.'));
        },
      });
  }
}
