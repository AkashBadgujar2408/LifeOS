import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  FinanceService,
  HOLDING_KINDS,
  Holding,
  HoldingKind,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { HOLDING_KIND_LABELS, formatMoney } from './finance-view';

export type HoldingEditorResult = { kind: 'saved'; holding: Holding } | { kind: 'deleted' };

/** Opens an investment (new when missing); resolves with what happened, or null if dismissed. */
export async function openHoldingEditor(
  modal: NgbModal,
  holding?: Holding,
): Promise<HoldingEditorResult | null> {
  const modalRef = modal.open(HoldingEditor, {
    ariaLabelledBy: 'holding-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as HoldingEditor).configure(holding);
  try {
    return (await modalRef.result) as HoldingEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-holding-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, DatePipe, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="holding-editor-heading" class="modal-title h5">
          {{ holding() ? 'Edit investment' : 'Add an investment' }}
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
          <label class="form-label" for="holding-name">Name</label>
          <input
            id="holding-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Nifty 50 index fund"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="holding-kind">Kind</label>
            <select id="holding-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="holding-currency">Currency</label>
            <select
              id="holding-currency"
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
            <label class="form-label" for="holding-units">
              Units <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="holding-units"
              type="number"
              step="any"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('units')"
              formControlName="units"
              placeholder="e.g. 125.4"
            />
            @if (fieldError('units'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="holding-invested">
              Put in <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="holding-invested"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('investedAmount')"
              formControlName="investedAmount"
              placeholder="e.g. 60000"
            />
            @if (fieldError('investedAmount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="holding-rate">
              Interest % <span class="text-body-secondary small">(FD, PPF)</span>
            </label>
            <input
              id="holding-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              class="form-control"
              [class.is-invalid]="fieldError('interestRate')"
              formControlName="interestRate"
              placeholder="e.g. 7.1"
            />
            @if (fieldError('interestRate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="holding-account">
              Held in <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="holding-account" class="form-select" formControlName="accountId">
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
        <div class="row g-3">
          @for (field of dateFields; track field.name) {
            <div class="col-sm-4">
              <label class="form-label" [for]="'holding-' + field.name">
                {{ field.label }} <span class="text-body-secondary small">(optional)</span>
              </label>
              <div class="input-group">
                <input
                  [id]="'holding-' + field.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(field.name)"
                  [formControlName]="field.name"
                  [placeholder]="field.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="'Pick the day: ' + field.label"
                  (click)="picker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError(field.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div>
          <label class="form-label" for="holding-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="holding-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Folio number's last digits, nominee, why you hold it"
          ></textarea>
        </div>

        @if (holding(); as h) {
          <div class="border-top pt-3">
            <h3 class="h6">What it's worth</h3>
            <p class="small text-body-secondary">
              Valued by hand — enter what a statement or app says on a day. The latest one counts.
            </p>
            <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
              <div>
                <label class="form-label small" for="valuation-day">Day</label>
                <div class="input-group input-group-sm">
                  <input
                    id="valuation-day"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="valuationError()"
                    [formControl]="valuationDay"
                    placeholder="e.g. 18/Oct/2026"
                    autocomplete="off"
                    ngbDatepicker
                    #valuationPicker="ngbDatepicker"
                    [minDate]="minDate"
                    [maxDate]="maxDate"
                    container="body"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    aria-label="Pick the valuation day"
                    (click)="valuationPicker.toggle()"
                  >
                    <i class="bi bi-calendar3"></i>
                  </button>
                </div>
              </div>
              <div>
                <label class="form-label small" for="valuation-value"
                  >Worth ({{ h.currency }})</label
                >
                <input
                  id="valuation-value"
                  type="number"
                  step="0.01"
                  min="0"
                  class="form-control form-control-sm"
                  [class.is-invalid]="valuationError()"
                  [formControl]="valuationValue"
                  placeholder="e.g. 72000"
                  (keydown.enter)="$event.preventDefault(); addValuation()"
                />
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary" (click)="addValuation()">
                Record
              </button>
            </div>
            @if (valuationError(); as error) {
              <div class="invalid-feedback d-block mb-2">{{ error }}</div>
            }
            @if (h.valuations.length > 0) {
              <ul class="list-unstyled small mb-0">
                @for (v of h.valuations; track v.id) {
                  <li class="d-flex justify-content-between gap-2 py-1 border-bottom">
                    <span>{{ v.valuedOn | date }}</span>
                    <span class="d-flex gap-3">
                      {{ money(v.value, h.currency) }}
                      <button
                        type="button"
                        class="btn btn-link btn-sm p-0 link-secondary"
                        [attr.aria-label]="'Remove the valuation of ' + (v.valuedOn | date)"
                        (click)="removeValuation(v.id)"
                      >
                        <i class="bi bi-x-lg"></i>
                      </button>
                    </span>
                  </li>
                }
              </ul>
            }
          </div>
          <div class="border-top pt-3">
            <app-linked-items entityType="Holding" [entityId]="h.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="Holding" [entityId]="h.id" [entityTitle]="h.name" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (holding()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="close()">
          {{ changed() ? 'Done' : 'Cancel' }}
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class HoldingEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = HOLDING_KINDS;
  protected readonly kindLabels = HOLDING_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly dateFields = [
    { name: 'acquiredOn', label: 'Bought', placeholder: 'e.g. 01/Feb/2026' },
    { name: 'maturesOn', label: 'Matures', placeholder: 'e.g. 01/Feb/2031' },
    { name: 'disposedOn', label: 'Sold / closed', placeholder: 'Leave blank while you hold it' },
  ] as const;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly accounts = toSignal(
    this.financeService.accounts().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly holding = signal<Holding | null>(null);
  protected readonly saving = signal(false);
  /** A valuation was recorded or removed: closing still reports "saved" so the list refreshes. */
  protected readonly changed = signal(false);
  protected readonly valuationError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<HoldingKind>('MutualFund'),
    currency: this.fb.nonNullable.control('', Validators.required),
    units: this.fb.control<number | null>(null, Validators.min(0.000001)),
    investedAmount: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    interestRate: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    accountId: this.fb.control<number | null>(null),
    acquiredOn: this.fb.control<string | null>(null),
    maturesOn: this.fb.control<string | null>(null),
    disposedOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });
  protected readonly valuationDay = this.fb.control<string | null>(todayIso());
  protected readonly valuationValue = this.fb.control<number | null>(null);

  configure(holding?: Holding): void {
    this.holding.set(holding ?? null);
    this.form.reset({
      name: holding?.name ?? '',
      kind: holding?.kind ?? 'MutualFund',
      currency: holding?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      units: holding?.units ?? null,
      investedAmount: holding?.investedAmount ?? null,
      interestRate: holding?.interestRate ?? null,
      accountId: holding?.accountId ?? null,
      acquiredOn: holding?.acquiredOn ?? null,
      maturesOn: holding?.maturesOn ?? null,
      disposedOn: holding?.disposedOn ?? null,
      notes: holding?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'currency'
      | 'units'
      | 'investedAmount'
      | 'interestRate'
      | 'acquiredOn'
      | 'maturesOn'
      | 'disposedOn',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name it.' : 'That is too long.';
      case 'currency':
        return 'Choose its currency.';
      case 'units':
        return 'Units have to be more than zero.';
      case 'investedAmount':
        return "Can't be negative or that large.";
      case 'interestRate':
        return 'A % between 0 and 100.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected close(): void {
    const holding = this.holding();
    if (this.changed() && holding) {
      this.activeModal.close({ kind: 'saved', holding });
    } else {
      this.activeModal.dismiss();
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.financeService
      .saveHolding(this.holding()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        currency: v.currency,
        units: v.units,
        investedAmount: v.investedAmount,
        interestRate: v.interestRate,
        accountId: v.accountId,
        acquiredOn: v.acquiredOn,
        maturesOn: v.maturesOn,
        disposedOn: v.disposedOn,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (holding) => this.activeModal.close({ kind: 'saved', holding }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the investment.'));
        },
      });
  }

  protected addValuation(): void {
    const holding = this.holding();
    const day = this.valuationDay.value;
    const value = this.valuationValue.value;
    if (!holding) {
      return;
    }
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      this.valuationError.set('Pick the day it was worth that.');
      return;
    }
    if (value === null || value < 0) {
      this.valuationError.set('Enter what it was worth (0 or more).');
      return;
    }
    this.valuationError.set(null);
    this.financeService.setValuation(holding.id, day, value, null).subscribe({
      next: (updated) => {
        this.holding.set(updated);
        this.changed.set(true);
        this.valuationValue.reset(null);
      },
      error: (err) => this.valuationError.set(apiErrorMessage(err, 'Could not record it.')),
    });
  }

  protected removeValuation(valuationId: number): void {
    const holding = this.holding();
    if (!holding) {
      return;
    }
    this.financeService.removeValuation(holding.id, valuationId).subscribe({
      next: (updated) => {
        this.holding.set(updated);
        this.changed.set(true);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the valuation.')),
    });
  }

  protected async remove(): Promise<void> {
    const holding = this.holding();
    if (!holding) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${holding.name}"?`,
      text: 'Its valuations go with it. If you sold it, set "Sold / closed" instead to keep its history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeHolding(holding.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the investment.')),
    });
  }
}
