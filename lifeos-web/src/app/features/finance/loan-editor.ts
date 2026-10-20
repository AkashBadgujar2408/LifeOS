import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ContactsService } from '../../core/services/contacts.service';
import {
  FinanceService,
  LOAN_KINDS,
  Loan,
  LoanDetail,
  LoanDirection,
  LoanKind,
  LoanRepaymentKind,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { LOAN_KIND_LABELS } from './finance-view';

export type LoanEditorResult = { kind: 'saved'; detail: LoanDetail } | { kind: 'deleted' };

/** Opens a loan (new when missing); resolves with what happened, or null if dismissed. */
export async function openLoanEditor(
  modal: NgbModal,
  loan?: Loan,
): Promise<LoanEditorResult | null> {
  const modalRef = modal.open(LoanEditor, { ariaLabelledBy: 'loan-editor-heading', size: 'lg' });
  (modalRef.componentInstance as LoanEditor).configure(loan);
  try {
    return (await modalRef.result) as LoanEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-loan-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="loan-editor-heading" class="modal-title h5">
          {{ loan() ? 'Edit loan' : 'Add a loan' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="btn-group w-100" role="radiogroup" aria-label="Borrowed or lent?">
          <input
            type="radio"
            class="btn-check"
            formControlName="direction"
            id="loan-borrowed"
            value="Borrowed"
          />
          <label class="btn btn-outline-primary btn-sm" for="loan-borrowed">
            <i class="bi bi-box-arrow-in-down"></i> I borrowed it
          </label>
          <input
            type="radio"
            class="btn-check"
            formControlName="direction"
            id="loan-lent"
            value="Lent"
          />
          <label class="btn btn-outline-primary btn-sm" for="loan-lent">
            <i class="bi bi-box-arrow-up"></i> I lent it
          </label>
        </div>
        <div class="row g-3">
          <div class="col-sm-8">
            <label class="form-label" for="loan-name">Name</label>
            <input
              id="loan-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Home loan"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="loan-kind">Kind</label>
            <select id="loan-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="loan-principal">Amount</label>
            <input
              id="loan-principal"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('principal')"
              formControlName="principal"
              placeholder="e.g. 1000000"
            />
            @if (fieldError('principal'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="loan-currency">Currency</label>
            <select
              id="loan-currency"
              class="form-select"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
            >
              <option [ngValue]="''" [selected]="!form.controls.currency.value" disabled>
                Choose…
              </option>
              @for (c of currencies(); track c.code) {
                <option [ngValue]="c.code" [selected]="c.code === form.controls.currency.value">
                  {{ c.code }} — {{ c.name }}
                </option>
              }
            </select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="loan-rate">Interest % a year</label>
            <input
              id="loan-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              class="form-control"
              [class.is-invalid]="fieldError('annualRate')"
              formControlName="annualRate"
              placeholder="e.g. 8.5 (0 if none)"
            />
            @if (fieldError('annualRate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <fieldset>
          <legend class="form-label fs-6 mb-1">Paid back</legend>
          <div class="btn-group btn-group-sm" role="group" aria-label="How it's paid back">
            <input
              type="radio"
              class="btn-check"
              id="loan-repay-emi"
              value="Emi"
              formControlName="repaymentKind"
            />
            <label class="btn btn-outline-secondary" for="loan-repay-emi"
              >EMI (fixed monthly)</label
            >
            <input
              type="radio"
              class="btn-check"
              id="loan-repay-flexible"
              value="Flexible"
              formControlName="repaymentKind"
            />
            <label class="btn btn-outline-secondary" for="loan-repay-flexible">As you go</label>
          </div>
          <div class="form-text">
            @if (isEmi()) {
              A fixed instalment over a term — the schedule shows if you're behind or ahead.
            } @else {
              No term, no instalment: pay whatever, whenever. Interest (if any) is charged monthly
              on what's left.
            }
          </div>
        </fieldset>
        <div class="row g-3">
          @if (isEmi()) {
            <div class="col-sm-4">
              <label class="form-label" for="loan-term">Term (months)</label>
              <input
                id="loan-term"
                type="number"
                min="1"
                max="600"
                class="form-control"
                [class.is-invalid]="fieldError('termMonths')"
                formControlName="termMonths"
                placeholder="e.g. 240"
              />
              @if (fieldError('termMonths'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
          <div class="col-sm-4">
            <label class="form-label" for="loan-start">Started</label>
            <div class="input-group">
              <input
                id="loan-start"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('startDate')"
                formControlName="startDate"
                placeholder="e.g. 15/Jan/2026"
                autocomplete="off"
                ngbDatepicker
                #startPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day it started"
                (click)="startPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('startDate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          @if (isEmi()) {
            <div class="col-sm-4">
              <label class="form-label" for="loan-emi">
                EMI <span class="text-body-secondary small">(if the lender's differs)</span>
              </label>
              <input
                id="loan-emi"
                type="number"
                step="0.01"
                min="0"
                class="form-control"
                [class.is-invalid]="fieldError('emiAmount')"
                formControlName="emiAmount"
                placeholder="Worked out if blank"
              />
              @if (fieldError('emiAmount'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        @if (isEmi()) {
          <div>
            <label class="form-label" for="loan-assumed">
              Instalments already paid up to
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="loan-assumed"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('assumedPaidThrough')"
                formControlName="assumedPaidThrough"
                placeholder="e.g. 20/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #assumedPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day instalments were paid up to"
                (click)="assumedPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('assumedPaidThrough'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            } @else {
              <div class="form-text">
                For a loan that's been running a while: every instalment due up to this day counts
                as paid, so you only record payments from then on.
              </div>
            }
          </div>
        }
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="loan-counterparty">
              {{ form.controls.direction.value === 'Lent' ? 'Lent to' : 'Lender' }}
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="loan-counterparty"
              type="text"
              class="form-control"
              formControlName="counterparty"
              [placeholder]="form.controls.direction.value === 'Lent' ? 'e.g. Ravi' : 'e.g. SBI'"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="loan-contact">
              Contact <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="loan-contact" class="form-select" formControlName="contactId">
              <option [ngValue]="null" [selected]="form.controls.contactId.value === null">
                None
              </option>
              @for (c of contacts(); track c.id) {
                <option [ngValue]="c.id" [selected]="c.id === form.controls.contactId.value">
                  {{ c.name }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="loan-account">
              {{ form.controls.direction.value === 'Lent' ? 'Repaid into' : 'Paid from' }}
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="loan-account" class="form-select" formControlName="accountId">
              <option [ngValue]="null" [selected]="form.controls.accountId.value === null">
                No account
              </option>
              @for (a of accounts(); track a.id) {
                <option [ngValue]="a.id" [selected]="a.id === form.controls.accountId.value">
                  {{ a.name }}
                </option>
              }
            </select>
          </div>
        </div>
        @if (!loan()) {
          <div class="form-check">
            <input
              id="loan-record-start"
              type="checkbox"
              class="form-check-input"
              formControlName="recordStart"
            />
            <label class="form-check-label" for="loan-record-start">
              Record the
              {{ form.controls.direction.value === 'Lent' ? 'money I lent' : 'money I received' }}
              in Finance
            </label>
            <div class="form-text">
              One transaction on the start day,
              {{ form.controls.direction.value === 'Lent' ? 'out of' : 'into' }}
              the account above. You can also do it later from the loan's page.
            </div>
            @if (fieldError('recordStart'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        @if (loan()) {
          <div class="col-sm-6">
            <label class="form-label" for="loan-closed">
              Closed on <span class="text-body-secondary small">(paid off early or settled)</span>
            </label>
            <div class="input-group">
              <input
                id="loan-closed"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('closedOn')"
                formControlName="closedOn"
                placeholder="Leave blank while it runs"
                autocomplete="off"
                ngbDatepicker
                #closedPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day it closed"
                (click)="closedPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('closedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <div>
          <label class="form-label" for="loan-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="loan-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Account number's last digits, collateral, prepayment terms"
          ></textarea>
        </div>
        <p class="small text-body-secondary mb-0">
          What's still owed follows the instalment schedule, assuming each one due was paid.
        </p>
      </div>
      <div class="modal-footer">
        @if (loan()) {
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
export class LoanEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = LOAN_KINDS;
  protected readonly kindLabels = LOAN_KIND_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly accounts = toSignal(
    this.financeService.accounts().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly contacts = toSignal(
    inject(ContactsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly loan = signal<Loan | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    direction: this.fb.nonNullable.control<LoanDirection>('Borrowed'),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<LoanKind>('Home'),
    principal: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control('', Validators.required),
    annualRate: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(100),
    ]),
    repaymentKind: this.fb.nonNullable.control<LoanRepaymentKind>('Emi'),
    assumedPaidThrough: this.fb.control<string | null>(null),
    recordStart: this.fb.nonNullable.control(false),
    termMonths: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(600)]),
    startDate: this.fb.control<string | null>(todayIso(), Validators.required),
    emiAmount: this.fb.control<number | null>(null, Validators.min(0.01)),
    counterparty: this.fb.nonNullable.control('', Validators.maxLength(200)),
    contactId: this.fb.control<number | null>(null),
    accountId: this.fb.control<number | null>(null),
    closedOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  /** EMI loans have a term, an instalment and "paid up to"; a pay-as-you-go loan has none. */
  protected readonly isEmi = toSignal(
    this.form.controls.repaymentKind.valueChanges.pipe(map((kind) => kind === 'Emi')),
    { initialValue: true },
  );

  configure(loan?: Loan): void {
    this.loan.set(loan ?? null);
    this.form.reset({
      direction: loan?.direction ?? 'Borrowed',
      name: loan?.name ?? '',
      kind: loan?.kind ?? 'Home',
      principal: loan?.principal ?? null,
      currency: loan?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      annualRate: loan?.annualRate ?? null,
      repaymentKind: loan?.repaymentKind ?? 'Emi',
      assumedPaidThrough: loan?.assumedPaidThrough ?? null,
      recordStart: false,
      termMonths: loan?.termMonths ?? null,
      startDate: loan?.startDate ?? todayIso(),
      emiAmount: loan?.emiAmount ?? null,
      counterparty: loan?.counterparty ?? '',
      contactId: loan?.contactId ?? null,
      accountId: loan?.accountId ?? null,
      closedOn: loan?.closedOn ?? null,
      notes: loan?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'principal'
      | 'currency'
      | 'annualRate'
      | 'termMonths'
      | 'assumedPaidThrough'
      | 'recordStart'
      | 'startDate'
      | 'emiAmount'
      | 'closedOn',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name it (e.g. Home loan).' : 'That is too long.';
      case 'principal':
        return control.errors['required'] ? 'Enter the amount.' : 'Has to be more than zero.';
      case 'currency':
        return 'Choose its currency.';
      case 'annualRate':
        return control.errors['required']
          ? 'Enter the rate (0 if none).'
          : 'A % between 0 and 100.';
      case 'termMonths':
        return control.errors['required']
          ? 'Give the term — or choose "As you go".'
          : '1 to 600 months.';
      case 'emiAmount':
        return 'Has to be more than zero — or leave it blank.';
      case 'startDate':
        return control.errors['required'] ? 'Say when it started.' : dateFieldError(control.errors);
      case 'assumedPaidThrough':
        return control.errors['future']
          ? 'That can’t be in the future.'
          : control.errors['early']
            ? 'That’s before it started.'
            : dateFieldError(control.errors);
      case 'recordStart':
        return control.errors['account']
          ? 'Choose the account above.'
          : control.errors['future']
            ? 'It starts in the future — record the money once it has changed hands.'
            : 'It’s not in your base currency — record it from the loan’s page (it needs a rate).';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    const emi = v.repaymentKind === 'Emi';
    const today = todayIso();
    // Checks that depend on the repayment kind (the server checks the same).
    this.form.controls.termMonths.updateValueAndValidity();
    this.form.controls.assumedPaidThrough.updateValueAndValidity();
    this.form.controls.recordStart.updateValueAndValidity();
    if (emi && v.termMonths === null) {
      this.form.controls.termMonths.setErrors({ required: true });
    }
    if (emi && v.assumedPaidThrough) {
      if (v.assumedPaidThrough > today) {
        this.form.controls.assumedPaidThrough.setErrors({ future: true });
      } else if (v.startDate && v.assumedPaidThrough < v.startDate) {
        this.form.controls.assumedPaidThrough.setErrors({ early: true });
      }
    }
    if (!this.loan() && v.recordStart) {
      const base = this.settingsService.settings()?.baseCurrency;
      if (v.accountId === null) {
        this.form.controls.recordStart.setErrors({ account: true });
      } else if (v.startDate && v.startDate > today) {
        this.form.controls.recordStart.setErrors({ future: true });
      } else if (base && v.currency !== base) {
        this.form.controls.recordStart.setErrors({ rate: true });
      }
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.financeService
      .saveLoan(this.loan()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        direction: v.direction,
        counterparty: v.counterparty.trim() || null,
        contactId: v.contactId,
        principal: v.principal!,
        currency: v.currency,
        annualRate: v.annualRate!,
        repaymentKind: v.repaymentKind,
        termMonths: emi ? v.termMonths : null,
        startDate: v.startDate!,
        emiAmount: emi ? v.emiAmount : null,
        assumedPaidThrough: emi ? v.assumedPaidThrough : null,
        disbursement:
          !this.loan() && v.recordStart && v.accountId !== null
            ? { accountId: v.accountId, exchangeRate: null, tagIds: [] }
            : null,
        accountId: v.accountId,
        closedOn: v.closedOn,
        notes: v.notes.trim() || null,
        today,
      })
      .subscribe({
        next: (detail) => this.activeModal.close({ kind: 'saved', detail }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the loan.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const loan = this.loan();
    if (!loan) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${loan.name}"?`,
      text: 'If it was paid off, set "Closed on" instead to keep its history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeLoan(loan.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the loan.')),
    });
  }
}
