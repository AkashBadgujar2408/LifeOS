import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService, Loan, LoanDetail } from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { formatMoney, heldCurrencies } from './finance-view';

export type LoanMoneyMode = 'payment' | 'start';

/** Records a repayment, or the money at the start, as a transaction. Resolves the updated loan, or null. */
export async function openLoanMoney(
  modal: NgbModal,
  loan: Loan,
  mode: LoanMoneyMode,
): Promise<LoanDetail | null> {
  const modalRef = modal.open(LoanMoneyDialog, { ariaLabelledBy: 'loan-money-heading' });
  (modalRef.componentInstance as LoanMoneyDialog).configure(loan, mode);
  try {
    return (await modalRef.result) as LoanDetail;
  } catch {
    return null;
  }
}

/**
 * Money for a loan, always through Finance: a repayment (borrowed: money out of an account; lent: money back in)
 * or the money that changed hands at the start (borrowed: in; lent: out), each one transaction tied to the loan.
 */
@Component({
  selector: 'app-loan-money-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="loan-money-heading" class="modal-title h5">{{ heading() }}</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (mode() === 'payment') {
          <div class="row g-3">
            <div class="col-sm-6">
              <label class="form-label" for="loan-money-on">Paid on</label>
              <div class="input-group">
                <input
                  id="loan-money-on"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('paidOn')"
                  formControlName="paidOn"
                  placeholder="e.g. 20/Oct/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  container="body"
                  [minDate]="minDate"
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
            <div class="col-sm-6">
              <label class="form-label" for="loan-money-amount">
                Amount ({{ loan()?.currency }})
              </label>
              <input
                id="loan-money-amount"
                type="number"
                min="0"
                step="0.01"
                class="form-control"
                [class.is-invalid]="fieldError('amount')"
                formControlName="amount"
                placeholder="e.g. 5000"
                ngbAutofocus
              />
              @if (fieldError('amount'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          </div>
        } @else {
          <p class="mb-0">
            {{ money(loan()?.principal ?? 0, loan()?.currency ?? 'INR') }} on the loan's start day,
            {{ loan()?.startDate | date }}.
          </p>
        }
        <div>
          <label class="form-label" for="loan-money-account">{{ accountLabel() }}</label>
          <ng-select
            labelForId="loan-money-account"
            [class.is-invalid]="fieldError('accountId')"
            formControlName="accountId"
            placeholder="Choose an account"
          >
            @for (a of payableAccounts(); track a.id) {
              <ng-option [value]="a.id">
                {{ a.name }}
              </ng-option>
            }
          </ng-select>
          @if (fieldError('accountId'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          } @else if (payableAccounts().length === 0) {
            <div class="form-text">No open account holds {{ loan()?.currency }}.</div>
          }
        </div>
        @if (needsRate()) {
          <div>
            <label class="form-label" for="loan-money-rate">
              Rate to {{ baseCurrency() }}
              <span class="text-body-secondary small">(1 {{ loan()?.currency }} =)</span>
            </label>
            <input
              id="loan-money-rate"
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
        @if (mode() === 'payment') {
          <div>
            <label class="form-label" for="loan-money-note">
              Note <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="loan-money-note"
              type="text"
              class="form-control"
              formControlName="note"
              placeholder="e.g. Part payment from the bonus"
            />
          </div>
        }
        <div>
          <span class="form-label d-block">Categories</span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ mode() === 'payment' ? 'Record payment' : 'Record in Finance' }}
        </button>
      </div>
    </form>
  `,
})
export class LoanMoneyDialog {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly money = formatMoney;
  protected readonly loan = signal<Loan | null>(null);
  protected readonly mode = signal<LoanMoneyMode>('payment');
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);
  protected minDate = { year: 1950, month: 1, day: 1 };

  private readonly accounts = toSignal(
    this.financeService.accounts().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly baseCurrency = computed(() => this.settingsService.settings()?.baseCurrency);
  protected readonly needsRate = computed(() => {
    const currency = this.loan()?.currency;
    return !!currency && !!this.baseCurrency() && currency !== this.baseCurrency();
  });
  protected readonly payableAccounts = computed(() => {
    const currency = this.loan()?.currency;
    return this.accounts().filter(
      (a) => !a.isArchived && !!currency && heldCurrencies(a).includes(currency),
    );
  });

  protected readonly heading = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return '';
    }
    if (this.mode() === 'start') {
      return loan.direction === 'Lent'
        ? 'Record the money you lent'
        : 'Record the money you received';
    }
    return loan.direction === 'Lent' ? 'Record money paid back to you' : 'Record a payment';
  });
  protected readonly accountLabel = computed(() => {
    const lent = this.loan()?.direction === 'Lent';
    const intoAccount = this.mode() === 'start' ? !lent : lent;
    return intoAccount ? 'Into account' : 'From account';
  });

  protected readonly form = this.fb.group({
    paidOn: this.fb.control<string | null>(todayIso(), Validators.required),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    accountId: this.fb.control<number | null>(null, Validators.required),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.000001)),
    note: this.fb.nonNullable.control('', Validators.maxLength(500)),
  });

  configure(loan: Loan, mode: LoanMoneyMode): void {
    this.loan.set(loan);
    this.mode.set(mode);
    const [year, month, day] = loan.startDate.split('-').map(Number);
    this.minDate = { year, month, day };
    // A payment defaults to the instalment, else whatever's still owed.
    const amount = loan.emi !== null ? Math.min(loan.emi, loan.outstanding) : loan.outstanding;
    this.form.reset({
      paidOn: todayIso(),
      amount: mode === 'payment' && amount > 0 ? Math.round(amount * 100) / 100 : null,
      accountId: loan.accountId,
      exchangeRate: null,
      note: '',
    });
    if (mode === 'start') {
      this.form.controls.paidOn.disable();
      this.form.controls.amount.disable();
    }
  }

  protected fieldError(name: 'paidOn' | 'amount' | 'accountId' | 'exchangeRate'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'paidOn':
        return control.errors['required']
          ? 'Say when it was paid.'
          : control.errors['future']
            ? 'It can’t be paid in the future.'
            : control.errors['early']
              ? 'That’s before the loan started.'
              : dateFieldError(control.errors);
      case 'amount':
        return 'Give the amount (more than zero).';
      case 'accountId':
        return 'Choose the account.';
      case 'exchangeRate':
        return 'Give the rate to your base currency.';
    }
  }

  protected submit(): void {
    const loan = this.loan();
    if (!loan) {
      return;
    }
    const v = this.form.getRawValue();
    const today = todayIso();
    if (this.mode() === 'payment' && v.paidOn) {
      if (v.paidOn > today) {
        this.form.controls.paidOn.setErrors({ future: true });
      } else if (v.paidOn < loan.startDate) {
        this.form.controls.paidOn.setErrors({ early: true });
      }
    }
    if (this.needsRate() && v.exchangeRate === null) {
      this.form.controls.exchangeRate.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const money = {
      accountId: v.accountId!,
      exchangeRate: this.needsRate() ? v.exchangeRate : null,
      tagIds: this.tagIds(),
    };
    this.saving.set(true);
    const request =
      this.mode() === 'payment'
        ? this.financeService.addLoanPayment(loan.id, {
            ...money,
            paidOn: v.paidOn!,
            amount: v.amount!,
            note: v.note.trim() || null,
            today,
          })
        : this.financeService.recordLoanStart(loan.id, money);
    request.subscribe({
      next: (detail) => this.activeModal.close(detail),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not record it.'));
      },
    });
  }
}
