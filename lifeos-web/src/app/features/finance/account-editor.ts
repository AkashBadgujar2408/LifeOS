import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  ACCOUNT_KINDS,
  Account,
  AccountKind,
  FinanceService,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { ACCOUNT_KIND_LABELS } from './finance-view';

export type AccountEditorResult = { kind: 'saved'; account: Account } | { kind: 'deleted' };

/** Opens an account (new when missing); resolves with what happened, or null if dismissed. */
export async function openAccountEditor(
  modal: NgbModal,
  account?: Account,
): Promise<AccountEditorResult | null> {
  const modalRef = modal.open(AccountEditor, { ariaLabelledBy: 'account-editor-heading' });
  (modalRef.componentInstance as AccountEditor).configure(account);
  try {
    return (await modalRef.result) as AccountEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-account-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="account-editor-heading" class="modal-title h5">
          {{ account() ? 'Edit account' : 'Add an account' }}
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
          <label class="form-label" for="account-name">Name</label>
          <input
            id="account-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. HDFC Savings"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label" for="account-kind">Kind</label>
            <select id="account-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-6">
            <label class="form-label" for="account-currency">Currency</label>
            <ng-select
              labelForId="account-currency"
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
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="account-institution">
              Bank or provider <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="account-institution"
              type="text"
              class="form-control"
              formControlName="institution"
              placeholder="e.g. HDFC Bank"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="account-number">
              Account or card number <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="account-number"
              type="text"
              class="form-control"
              formControlName="number"
              placeholder="Only the last 4 are kept"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="account-opening">Opening balance</label>
            <input
              id="account-opening"
              type="number"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('openingBalance')"
              formControlName="openingBalance"
              placeholder="e.g. 25000 (negative if a card owes)"
            />
            @if (fieldError('openingBalance'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="account-opening-date">On</label>
            <div class="input-group">
              <input
                id="account-opening-date"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('openingDate')"
                formControlName="openingDate"
                placeholder="e.g. 01/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #openingPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day of the opening balance"
                (click)="openingPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('openingDate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <p class="small text-body-secondary mb-0">
          What it held at the start of that day. Transactions from then on make up the balance.
        </p>
        <div formArrayName="extras">
          <span class="form-label d-block mb-1">
            Other currencies it holds
            <span class="text-body-secondary small">(PayPal, Wise — leave empty otherwise)</span>
          </span>
          @for (extra of form.controls.extras.controls; track extra; let i = $index) {
            <div class="d-flex flex-wrap gap-2 align-items-start mb-2" [formGroupName]="i">
              <div class="flex-grow-1" style="min-width: 9rem">
                <select
                  class="form-select"
                  [class.is-invalid]="extraError(i)"
                  formControlName="currency"
                  [attr.aria-label]="'Currency ' + (i + 2)"
                >
                  <option [ngValue]="''" [selected]="!extra.controls.currency.value" disabled>
                    Choose…
                  </option>
                  @for (c of currencies(); track c.code) {
                    <option
                      [ngValue]="c.code"
                      [selected]="c.code === extra.controls.currency.value"
                    >
                      {{ c.code }} — {{ c.name }}
                    </option>
                  }
                </select>
                @if (extraError(i); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
              <input
                type="number"
                step="0.01"
                class="form-control"
                style="max-width: 10rem"
                formControlName="openingBalance"
                placeholder="Opening, e.g. 50"
                [attr.aria-label]="'Opening balance in currency ' + (i + 2)"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                [attr.aria-label]="'Remove currency ' + (i + 2)"
                (click)="form.controls.extras.removeAt(i)"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          }
          <button type="button" class="btn btn-sm btn-link px-0" (click)="addExtra()">
            <i class="bi bi-plus"></i> Add a currency
          </button>
        </div>
        <div>
          <label class="form-label" for="account-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="account-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Branch, nominee, what it's for"
          ></textarea>
        </div>
        @if (account()) {
          <div class="form-check">
            <input
              id="account-archived"
              type="checkbox"
              class="form-check-input"
              formControlName="isArchived"
            />
            <label class="form-check-label" for="account-archived">
              Archived — closed, kept for its history, takes no new transactions
            </label>
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (account()) {
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
export class AccountEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly account = signal<Account | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<AccountKind>('Bank'),
    currency: this.fb.nonNullable.control('', Validators.required),
    institution: this.fb.nonNullable.control('', Validators.maxLength(200)),
    number: this.fb.nonNullable.control('', Validators.maxLength(100)),
    openingBalance: this.fb.control<number | null>(0, [
      Validators.required,
      Validators.min(-999_999_999_999_999),
      Validators.max(999_999_999_999_999),
    ]),
    openingDate: this.fb.control<string | null>(todayIso(), Validators.required),
    isArchived: this.fb.nonNullable.control(false),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    extras: this.fb.array<ReturnType<AccountEditor['extraGroup']>>([]),
  });

  configure(account?: Account): void {
    this.account.set(account ?? null);
    this.form.controls.extras.clear();
    for (const extra of account?.balances.slice(1) ?? []) {
      this.form.controls.extras.push(this.extraGroup(extra.currency, extra.openingBalance));
    }
    this.form.reset({
      name: account?.name ?? '',
      kind: account?.kind ?? 'Bank',
      currency: account?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      institution: account?.institution ?? '',
      // The stored last 4 go back as the number, so saving doesn't lose them.
      number: account?.numberLast4 ?? '',
      openingBalance: account?.openingBalance ?? 0,
      openingDate: account?.openingDate ?? todayIso(),
      isArchived: account?.isArchived ?? false,
      notes: account?.notes ?? '',
      extras: (account?.balances.slice(1) ?? []).map((b) => ({
        currency: b.currency,
        openingBalance: b.openingBalance,
      })),
    });
  }

  private extraGroup(currency = '', openingBalance: number | null = 0) {
    return this.fb.nonNullable.group({
      currency: this.fb.nonNullable.control(currency, Validators.required),
      openingBalance: this.fb.control<number | null>(openingBalance),
    });
  }

  protected addExtra(): void {
    this.form.controls.extras.push(this.extraGroup());
  }

  /** An extra currency's problem: not chosen, the main currency again, or listed twice. */
  protected extraError(index: number): string | null {
    const control = this.form.controls.extras.at(index).controls.currency;
    const code = control.value;
    if (!code) {
      return control.touched ? 'Choose the currency.' : null;
    }
    if (code === this.form.controls.currency.value) {
      return 'That is the main currency already.';
    }
    const all = this.form.controls.extras.controls.map((e) => e.controls.currency.value);
    return all.indexOf(code) !== index ? 'Listed twice.' : null;
  }

  protected fieldError(
    name: 'name' | 'currency' | 'openingBalance' | 'openingDate',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'openingDate') {
      return control.errors['required'] ? 'Say which day.' : dateFieldError(control.errors);
    }
    if (name === 'currency') {
      return 'Choose its currency.';
    }
    if (name === 'openingBalance') {
      return control.errors['required'] ? 'Enter what it held (0 is fine).' : 'That is too large.';
    }
    return control.errors['required'] ? 'Name the account.' : 'That is too long.';
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const extrasWrong = this.form.controls.extras.controls.some((_, i) => this.extraError(i));
    if (this.form.invalid || extrasWrong) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.financeService
      .saveAccount(this.account()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        currency: v.currency,
        institution: v.institution.trim() || null,
        number: v.number.trim() || null,
        openingBalance: v.openingBalance ?? 0,
        openingDate: v.openingDate!,
        isArchived: v.isArchived,
        notes: v.notes.trim() || null,
        extraCurrencies: v.extras.map((e) => ({
          currency: e.currency,
          openingBalance: e.openingBalance ?? 0,
        })),
      })
      .subscribe({
        next: (account) => this.activeModal.close({ kind: 'saved', account }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the account.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const account = this.account();
    if (!account) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${account.name}"?`,
      text:
        account.transactionCount > 0
          ? 'Money has moved through it — archive it instead to keep the history.'
          : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeAccount(account.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the account.')),
    });
  }
}
