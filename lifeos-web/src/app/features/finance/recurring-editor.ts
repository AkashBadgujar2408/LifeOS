import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { startWith } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  Account,
  FinanceService,
  RecurringTransaction,
  TRANSACTION_KINDS,
  TransactionKind,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { RECURRENCE_FREQUENCIES, RecurrenceFrequency } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { intervalUnit } from '../calendar/event-recurrence';
import {
  TRANSACTION_KIND_ICONS,
  TRANSACTION_KIND_LABELS,
  heldCurrencies,
  pickCurrency,
} from './finance-view';

export type RecurringEditorResult =
  { kind: 'saved'; schedule: RecurringTransaction } | { kind: 'deleted' };

/** Opens a repeating transaction (new when missing); resolves with what happened, or null if dismissed. */
export async function openRecurringEditor(
  modal: NgbModal,
  schedule?: RecurringTransaction,
): Promise<RecurringEditorResult | null> {
  const modalRef = modal.open(RecurringEditor, {
    ariaLabelledBy: 'recurring-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as RecurringEditor).configure(schedule);
  try {
    return (await modalRef.result) as RecurringEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-recurring-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, TagPicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="recurring-editor-heading" class="modal-title h5">
          {{ existing() ? 'Edit repeating transaction' : 'Add a repeating transaction' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="btn-group w-100" role="radiogroup" aria-label="What kind of transaction?">
          @for (k of kinds; track k) {
            <input
              type="radio"
              class="btn-check"
              formControlName="kind"
              [id]="'rec-kind-' + k"
              [value]="k"
            />
            <label class="btn btn-outline-primary btn-sm" [for]="'rec-kind-' + k">
              <i class="bi {{ kindIcons[k] }}"></i> {{ kindLabels[k] }}
            </label>
          }
        </div>

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="rec-name">Name</label>
            <input
              id="rec-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Rent"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="rec-amount">
              Amount
              @if (currency(); as c) {
                <span class="text-body-secondary small">({{ c }})</span>
              }
            </label>
            <input
              id="rec-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 18000"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>

        <div class="row g-3">
          @if (kind() !== 'Income') {
            <div class="col-sm-6">
              <label class="form-label" for="rec-from">
                {{ kind() === 'Transfer' ? 'From' : 'Paid from' }}
              </label>
              <select
                id="rec-from"
                class="form-select"
                [class.is-invalid]="fieldError('fromAccountId')"
                formControlName="fromAccountId"
              >
                <option [ngValue]="null" [selected]="form.controls.fromAccountId.value === null">
                  Choose an account…
                </option>
                @for (a of pickable(); track a.id) {
                  <option [ngValue]="a.id" [selected]="a.id === form.controls.fromAccountId.value">
                    {{ a.name }} ({{ held(a).join(', ') }})
                  </option>
                }
              </select>
              @if (fieldError('fromAccountId'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
          @if (kind() !== 'Expense') {
            <div class="col-sm-6">
              <label class="form-label" for="rec-to">
                {{ kind() === 'Transfer' ? 'To' : 'Paid into' }}
              </label>
              <select
                id="rec-to"
                class="form-select"
                [class.is-invalid]="fieldError('toAccountId')"
                formControlName="toAccountId"
              >
                <option [ngValue]="null" [selected]="form.controls.toAccountId.value === null">
                  Choose an account…
                </option>
                @for (a of pickable(); track a.id) {
                  <option [ngValue]="a.id" [selected]="a.id === form.controls.toAccountId.value">
                    {{ a.name }} ({{ held(a).join(', ') }})
                  </option>
                }
              </select>
              @if (fieldError('toAccountId'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>

        @if (movingHeld().length > 1 || arrivingHeld().length > 1) {
          <div class="row g-3">
            @if (movingHeld().length > 1) {
              <div class="col-sm-6">
                <label class="form-label" for="rec-currency">
                  {{ kind() === 'Income' ? 'Arrives in' : 'Paid in' }}
                </label>
                <select id="rec-currency" class="form-select" formControlName="moveCurrency">
                  @for (c of movingHeld(); track c) {
                    <option [ngValue]="c" [selected]="c === currency()">{{ c }}</option>
                  }
                </select>
              </div>
            }
            @if (arrivingHeld().length > 1) {
              <div class="col-sm-6">
                <label class="form-label" for="rec-arrive-currency">Arrives as</label>
                <select
                  id="rec-arrive-currency"
                  class="form-select"
                  formControlName="arriveCurrency"
                >
                  @for (c of arrivingHeld(); track c) {
                    <option [ngValue]="c" [selected]="c === toCurrency()">{{ c }}</option>
                  }
                </select>
              </div>
            }
          </div>
        }
        @if (needsToAmount()) {
          <div>
            <label class="form-label" for="rec-to-amount">Arrives ({{ toCurrency() }})</label>
            <input
              id="rec-to-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('toAmount')"
              formControlName="toAmount"
              placeholder="What lands in the other account each time"
            />
            @if (fieldError('toAmount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        @if (needsRate()) {
          <div>
            <label class="form-label" for="rec-rate">Rate to {{ baseCurrency() }}</label>
            <input
              id="rec-rate"
              type="number"
              step="any"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('exchangeRate')"
              formControlName="exchangeRate"
              [placeholder]="'How many ' + baseCurrency() + ' one ' + currency() + ' is worth'"
            />
            @if (fieldError('exchangeRate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }

        <div class="row g-3">
          <div class="col-6 col-sm-3">
            <label class="form-label" for="rec-interval">Every</label>
            <input
              id="rec-interval"
              type="number"
              min="1"
              max="999"
              class="form-control"
              [class.is-invalid]="fieldError('recurrenceInterval')"
              formControlName="recurrenceInterval"
              placeholder="1"
            />
            @if (fieldError('recurrenceInterval'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="rec-frequency">&nbsp;</label>
            <select id="rec-frequency" class="form-select" formControlName="recurrenceFrequency">
              @for (f of frequencies; track f) {
                <option [ngValue]="f" [selected]="f === form.controls.recurrenceFrequency.value">
                  {{ unit(f) }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="rec-start">Starting</label>
            <div class="input-group">
              <input
                id="rec-start"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('startDate')"
                formControlName="startDate"
                placeholder="e.g. 01/Nov/2026"
                autocomplete="off"
                ngbDatepicker
                #startPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the first day"
                (click)="startPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('startDate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="rec-until">
              Last day <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="rec-until"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('until')"
                formControlName="until"
                placeholder="e.g. 31/Mar/2031 (an EMI's last month)"
                autocomplete="off"
                ngbDatepicker
                #untilPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the last day"
                (click)="untilPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('until'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="rec-payee">
              {{ kind() === 'Income' ? 'From whom' : 'Paid to' }}
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="rec-payee"
              type="text"
              class="form-control"
              formControlName="payee"
              [placeholder]="kind() === 'Income' ? 'e.g. Acme Ltd' : 'e.g. Landlord'"
              autocomplete="off"
            />
          </div>
        </div>

        <div>
          <span class="form-label d-block">
            Tags <span class="text-body-secondary small">(copied onto each transaction)</span>
          </span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>
        <div>
          <label class="form-label" for="rec-note">
            Note <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="rec-note"
            type="text"
            class="form-control"
            formControlName="note"
            placeholder="e.g. Flat 4B, paid by standing instruction"
            autocomplete="off"
          />
        </div>
        @if (existing()) {
          <div class="form-check">
            <input
              id="rec-paused"
              type="checkbox"
              class="form-check-input"
              formControlName="isPaused"
            />
            <label class="form-check-label" for="rec-paused">
              Paused — writes nothing; resuming carries on from today without catching up
            </label>
          </div>
        }
        <p class="small text-body-secondary mb-0">
          Each one is written into the ledger on its day (days already past are written as soon as
          you save). Changing this later doesn't touch what's already written.
        </p>
      </div>
      <div class="modal-footer">
        @if (existing()) {
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
export class RecurringEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = TRANSACTION_KINDS;
  protected readonly kindLabels = TRANSACTION_KIND_LABELS;
  protected readonly kindIcons = TRANSACTION_KIND_ICONS;
  protected readonly frequencies = RECURRENCE_FREQUENCIES;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly existing = signal<RecurringTransaction | null>(null);
  protected readonly saving = signal(false);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly baseCurrency = computed(
    () => this.settingsService.settings()?.baseCurrency ?? null,
  );

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<TransactionKind>('Expense'),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    fromAccountId: this.fb.control<number | null>(null),
    toAccountId: this.fb.control<number | null>(null),
    toAmount: this.fb.control<number | null>(null, Validators.min(0.01)),
    // Multi-currency accounts: the currency chosen to move in / arrive in (null: the account's main one).
    moveCurrency: this.fb.control<string | null>(null),
    arriveCurrency: this.fb.control<string | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.00000001)),
    recurrenceFrequency: this.fb.nonNullable.control<RecurrenceFrequency>('Monthly'),
    recurrenceInterval: this.fb.control<number | null>(1, [
      Validators.required,
      Validators.min(1),
      Validators.max(999),
    ]),
    startDate: this.fb.control<string | null>(todayIso(), Validators.required),
    until: this.fb.control<string | null>(null),
    payee: this.fb.nonNullable.control('', Validators.maxLength(200)),
    note: this.fb.nonNullable.control('', Validators.maxLength(1000)),
    isPaused: this.fb.nonNullable.control(false),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly kind = computed(() => this.value().kind ?? 'Expense');
  protected readonly unit = (f: RecurrenceFrequency) =>
    intervalUnit(f, this.value().recurrenceInterval ?? 1);

  protected readonly pickable = computed(() => {
    const s = this.existing();
    const kept = new Set([s?.fromAccountId, s?.toAccountId]);
    return this.accounts().filter((a) => !a.isArchived || kept.has(a.id));
  });

  private account(id: number | null | undefined): Account | undefined {
    return id == null ? undefined : this.accounts().find((a) => a.id === id);
  }

  protected readonly held = heldCurrencies;
  protected readonly movingHeld = computed(() => {
    const v = this.value();
    return heldCurrencies(this.account(this.kind() === 'Income' ? v.toAccountId : v.fromAccountId));
  });
  protected readonly arrivingHeld = computed(() =>
    this.kind() === 'Transfer' ? heldCurrencies(this.account(this.value().toAccountId)) : [],
  );
  /** The amount's currency: the one chosen on a multi-currency account, else the account's own. */
  protected readonly currency = computed(() =>
    pickCurrency(this.movingHeld(), this.value().moveCurrency),
  );
  /** What a transfer arrives in: the one chosen, else as it left if held, else the receiving account's own. */
  protected readonly toCurrency = computed(() =>
    pickCurrency(this.arrivingHeld(), this.value().arriveCurrency, this.currency()),
  );
  protected readonly needsToAmount = computed(() => {
    const to = this.toCurrency();
    return to !== null && this.currency() !== null && to !== this.currency();
  });
  protected readonly needsRate = computed(() => {
    const base = this.baseCurrency();
    const currency = this.currency();
    if (!base || !currency || currency === base) {
      return false;
    }
    return !(this.needsToAmount() && this.toCurrency() === base);
  });

  constructor() {
    this.financeService
      .accounts()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (accounts) => this.accounts.set(accounts),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load your accounts.')),
      });
  }

  configure(schedule?: RecurringTransaction): void {
    this.existing.set(schedule ?? null);
    this.tagIds.set(schedule?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      kind: schedule?.kind ?? 'Expense',
      name: schedule?.name ?? '',
      amount: schedule?.amount ?? null,
      fromAccountId: schedule?.fromAccountId ?? null,
      toAccountId: schedule?.toAccountId ?? null,
      toAmount: schedule?.toAmount ?? null,
      moveCurrency: schedule?.currency ?? null,
      arriveCurrency: schedule ? (schedule.toCurrency ?? schedule.currency) : null,
      exchangeRate: schedule?.exchangeRate ?? null,
      recurrenceFrequency: schedule?.recurrenceFrequency ?? 'Monthly',
      recurrenceInterval: schedule?.recurrenceInterval ?? 1,
      startDate: schedule?.startDate ?? todayIso(),
      until: schedule?.until ?? null,
      payee: schedule?.payee ?? '',
      note: schedule?.note ?? '',
      isPaused: schedule?.isPaused ?? false,
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'amount'
      | 'fromAccountId'
      | 'toAccountId'
      | 'toAmount'
      | 'exchangeRate'
      | 'recurrenceInterval'
      | 'startDate'
      | 'until',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name it (e.g. Rent).' : 'That is too long.';
      case 'startDate':
        return control.errors['required'] ? 'Say when it starts.' : dateFieldError(control.errors);
      case 'until':
        return control.errors['beforeStart']
          ? "It can't stop before it starts."
          : dateFieldError(control.errors);
      case 'recurrenceInterval':
        return 'Repeat every 1 to 999.';
      case 'fromAccountId':
      case 'toAccountId':
        return control.errors['same'] ? 'Pick two different accounts.' : 'Choose an account.';
      case 'toAmount':
        return control.errors['required'] ? 'Say how much arrives.' : 'Has to be more than zero.';
      case 'exchangeRate':
        return control.errors['required'] ? 'Give the rate.' : 'Has to be more than zero.';
      default:
        return control.errors['required']
          ? 'Enter the amount.'
          : control.errors['min']
            ? 'Has to be more than zero.'
            : 'That is too large.';
    }
  }

  /** Requirements that depend on the kind, the accounts and the dates, set just before checking the form. */
  private applyConditionalRules(): void {
    const c = this.form.controls;
    const kind = c.kind.value;
    const required = (on: boolean, control: typeof c.fromAccountId) => {
      control.setErrors(null);
      control.updateValueAndValidity({ emitEvent: false });
      if (on && control.value === null) {
        control.setErrors({ required: true });
      }
    };
    required(kind !== 'Income', c.fromAccountId);
    required(kind !== 'Expense', c.toAccountId);
    required(this.needsToAmount(), c.toAmount);
    required(this.needsRate(), c.exchangeRate);
    if (
      kind === 'Transfer' &&
      c.fromAccountId.value !== null &&
      c.fromAccountId.value === c.toAccountId.value
    ) {
      c.toAccountId.setErrors({ same: true });
    }
    c.until.updateValueAndValidity({ emitEvent: false });
    if (c.until.value && c.startDate.value && c.until.value < c.startDate.value) {
      c.until.setErrors({ beforeStart: true });
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    this.applyConditionalRules();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.financeService
      .saveRecurring(this.existing()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        amount: v.amount!,
        exchangeRate: this.needsRate() ? v.exchangeRate : null,
        toAmount: this.needsToAmount() ? v.toAmount : null,
        currency: this.movingHeld().length > 1 ? this.currency() : null,
        toCurrency: this.arrivingHeld().length > 1 ? this.toCurrency() : null,
        fromAccountId: v.kind === 'Income' ? null : v.fromAccountId,
        toAccountId: v.kind === 'Expense' ? null : v.toAccountId,
        payee: v.payee.trim() || null,
        note: v.note.trim() || null,
        recurrenceFrequency: v.recurrenceFrequency,
        recurrenceInterval: v.recurrenceInterval!,
        startDate: v.startDate!,
        until: v.until,
        isPaused: v.isPaused,
        tagIds: this.tagIds(),
        today: todayIso(),
      })
      .subscribe({
        next: (schedule) => this.activeModal.close({ kind: 'saved', schedule }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the repeating transaction.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const schedule = this.existing();
    if (!schedule) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${schedule.name}"?`,
      text: 'It stops writing new transactions. The ones it already wrote stay in the ledger.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeRecurring(schedule.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) =>
        this.toast.error(apiErrorMessage(err, 'Could not delete the repeating transaction.')),
    });
  }
}
