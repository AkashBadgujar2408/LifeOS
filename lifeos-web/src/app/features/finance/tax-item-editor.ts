import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  FinanceService,
  TAX_ITEM_KINDS,
  TaxItem,
  TaxItemKind,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TAX_ITEM_KIND_LABELS, formatMoney } from './finance-view';

export type TaxItemEditorResult = { kind: 'saved'; item: TaxItem } | { kind: 'deleted' };

/** Opens a tax item (new when missing, with an optional tax year to start in). */
export async function openTaxItemEditor(
  modal: NgbModal,
  item?: TaxItem,
  taxYear?: string | null,
): Promise<TaxItemEditorResult | null> {
  const modalRef = modal.open(TaxItemEditor, { ariaLabelledBy: 'tax-editor-heading', size: 'lg' });
  (modalRef.componentInstance as TaxItemEditor).configure(item, taxYear);
  try {
    return (await modalRef.result) as TaxItemEditorResult;
  } catch {
    return null;
  }
}

/** How far back the "about a transaction" list goes (a tax year and a bit). */
const TRANSACTION_DAYS = 550;

@Component({
  selector: 'app-tax-item-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, DatePipe, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="tax-editor-heading" class="modal-title h5">
          {{ item() ? 'Edit tax item' : 'Add a tax item' }}
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
          <div class="col-sm-8">
            <label class="form-label" for="tax-title">What is it?</label>
            <input
              id="tax-title"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('title')"
              formControlName="title"
              placeholder="e.g. File income tax return"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('title'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="tax-kind">Kind</label>
            <select id="tax-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="tax-year">Tax year</label>
            <input
              id="tax-year"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('taxYear')"
              formControlName="taxYear"
              placeholder="e.g. FY 2026-27"
              autocomplete="off"
            />
            @if (fieldError('taxYear'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="tax-due">
              Due on <span class="text-body-secondary small">(shows on the calendar)</span>
            </label>
            <div class="input-group">
              <input
                id="tax-due"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('dueOn')"
                formControlName="dueOn"
                placeholder="e.g. 31/Jul/2027"
                autocomplete="off"
                ngbDatepicker
                #duePicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the due day"
                (click)="duePicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('dueOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="tax-transaction">
            About a transaction <span class="text-body-secondary small">(optional)</span>
          </label>
          <select id="tax-transaction" class="form-select" formControlName="transactionId">
            <option [ngValue]="null" [selected]="form.controls.transactionId.value === null">
              None
            </option>
            @for (t of transactions(); track t.id) {
              <option [ngValue]="t.id" [selected]="t.id === form.controls.transactionId.value">
                {{ t.occurredOn | date }} · {{ t.label }} · {{ money(t.amount, t.currency) }}
              </option>
            }
          </select>
          <div class="form-text">The premium you paid, the tax payment, the donation receipt.</div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="tax-amount">
              Amount <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="tax-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              [placeholder]="
                form.controls.transactionId.value
                  ? 'Blank: the transaction’s amount'
                  : 'e.g. 150000'
              "
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="tax-currency">Currency</label>
            <select
              id="tax-currency"
              class="form-select"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
            >
              <option [ngValue]="null" [selected]="form.controls.currency.value === null">—</option>
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
        </div>
        <div class="d-flex flex-wrap gap-4">
          <div class="form-check">
            <input
              id="tax-deductible"
              type="checkbox"
              class="form-check-input"
              formControlName="isDeductible"
            />
            <label class="form-check-label" for="tax-deductible">Deductible</label>
          </div>
          <div class="form-check">
            <input id="tax-done" type="checkbox" class="form-check-input" formControlName="done" />
            <label class="form-check-label" for="tax-done">
              Done
              @if (item()?.doneOn; as doneOn) {
                <span class="text-body-secondary small">({{ doneOn | date }})</span>
              }
            </label>
          </div>
        </div>
        <div>
          <label class="form-label" for="tax-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="tax-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Section (e.g. 80D), acknowledgement number, who files it"
          ></textarea>
        </div>
        @if (item(); as i) {
          <div class="border-top pt-3">
            <app-linked-items entityType="TaxItem" [entityId]="i.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="TaxItem" [entityId]="i.id" [entityTitle]="i.title" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (item()) {
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
export class TaxItemEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = TAX_ITEM_KINDS;
  protected readonly kindLabels = TAX_ITEM_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly recent = toSignal(
    this.financeService
      .ledger({
        from: addDaysIso(todayIso(), -TRANSACTION_DAYS),
        to: null,
        accountId: null,
        tagId: null,
        kind: null,
      })
      .pipe(
        map((ledger) => ledger.transactions.filter((t) => t.kind !== 'Transfer').slice(0, 300)),
        catchError(() => of([])),
      ),
    { initialValue: [] },
  );
  protected readonly item = signal<TaxItem | null>(null);

  /** Recent income and spending, plus the one already chosen if it is older than the list goes back. */
  protected readonly transactions = computed(() => {
    const list = this.recent().map((t) => ({
      id: t.id,
      occurredOn: t.occurredOn,
      label: t.payee ?? t.note ?? t.kind,
      amount: t.amount,
      currency: t.currency,
    }));
    const chosen = this.item();
    if (chosen?.transactionId && !list.some((t) => t.id === chosen.transactionId)) {
      list.push({
        id: chosen.transactionId,
        occurredOn: chosen.transactionOn!,
        label: chosen.transactionPayee ?? 'Transaction',
        amount: chosen.transactionAmount!,
        currency: chosen.transactionCurrency!,
      });
    }
    return list;
  });
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<TaxItemKind>('Deadline'),
    taxYear: this.fb.nonNullable.control('', Validators.maxLength(20)),
    dueOn: this.fb.control<string | null>(null),
    amount: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.control<string | null>(null),
    isDeductible: this.fb.nonNullable.control(false),
    transactionId: this.fb.control<number | null>(null),
    done: this.fb.nonNullable.control(false),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(item?: TaxItem, taxYear?: string | null): void {
    this.item.set(item ?? null);
    this.form.reset({
      title: item?.title ?? '',
      kind: item?.kind ?? 'Deadline',
      taxYear: item?.taxYear ?? taxYear ?? '',
      dueOn: item?.dueOn ?? null,
      amount: item?.amount ?? null,
      currency: item?.currency ?? null,
      isDeductible: item?.isDeductible ?? false,
      transactionId: item?.transactionId ?? null,
      done: !!item?.doneOn,
      notes: item?.notes ?? '',
    });
  }

  protected fieldError(name: 'title' | 'taxYear' | 'dueOn' | 'amount' | 'currency'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'title':
        return control.errors['required']
          ? 'Say what it is (e.g. File income tax return).'
          : 'That is too long.';
      case 'taxYear':
        return 'At most 20 characters (e.g. FY 2026-27).';
      case 'amount':
        return control.errors['pair']
          ? 'Give the amount too, or clear the currency.'
          : 'Has to be more than zero — or leave it blank.';
      case 'currency':
        return 'Choose the amount’s currency.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    this.form.controls.amount.updateValueAndValidity();
    this.form.controls.currency.updateValueAndValidity();
    const v = this.form.getRawValue();
    if (v.amount !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    } else if (v.amount === null && v.currency && !v.transactionId) {
      this.form.controls.amount.setErrors({ pair: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const existing = this.item();
    const today = todayIso();
    this.saving.set(true);
    this.financeService
      .saveTaxItem(existing?.id ?? null, {
        title: v.title,
        kind: v.kind,
        taxYear: v.taxYear.trim() || null,
        dueOn: v.dueOn,
        amount: v.amount,
        currency: v.amount === null ? null : v.currency,
        isDeductible: v.isDeductible,
        transactionId: v.transactionId,
        // Keep the day it was first marked done; a new tick is today.
        doneOn: v.done ? (existing?.doneOn ?? today) : null,
        notes: v.notes.trim() || null,
        today,
      })
      .subscribe({
        next: (item) => this.activeModal.close({ kind: 'saved', item }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the tax item.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const item = this.item();
    if (!item) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${item.title}"?`,
      text: 'If it is handled, tick Done instead to keep it with its tax year.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeTaxItem(item.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the tax item.')),
    });
  }
}
