import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of, startWith } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { CareerService } from '../../core/services/career.service';
import {
  Account,
  ExchangeRate,
  FinanceService,
  TRANSACTION_KINDS,
  Transaction,
  TransactionKind,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Attachments } from '../../shared/components/attachments/attachments';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import {
  TRANSACTION_KIND_ICONS,
  TRANSACTION_KIND_LABELS,
  heldCurrencies,
  pickCurrency,
  rateOn,
  transactionTitle,
} from './finance-view';

export type TransactionEditorResult =
  { kind: 'saved'; transaction: Transaction } | { kind: 'deleted' };

export interface TransactionEditorOptions {
  transaction?: Transaction;
  /** For a new one: what it is, and the account it starts on (the ledger's account filter). */
  kind?: TransactionKind;
  accountId?: number | null;
}

/** Opens a transaction (new when none is given); resolves with what happened, or null if dismissed. */
export async function openTransactionEditor(
  modal: NgbModal,
  options: TransactionEditorOptions = {},
): Promise<TransactionEditorResult | null> {
  const modalRef = modal.open(TransactionEditor, {
    ariaLabelledBy: 'transaction-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as TransactionEditor).configure(options);
  try {
    return (await modalRef.result) as TransactionEditorResult;
  } catch {
    return null;
  }
}

/** "e:5" = salary from role 5, "s:3" = side income source 3, "" = neither. */
type IncomeFor = string;

@Component({
  selector: 'app-transaction-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    Attachments,
    LinkedItems,
    EntityReminders,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="transaction-editor-heading" class="modal-title h5">
          {{ existing() ? 'Edit ' + kindLabels[kind()].toLowerCase() : 'Add a transaction' }}
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
              [id]="'tx-kind-' + k"
              [value]="k"
            />
            <label class="btn btn-outline-primary btn-sm" [for]="'tx-kind-' + k">
              <i class="bi {{ kindIcons[k] }}"></i> {{ kindLabels[k] }}
            </label>
          }
        </div>

        @if (!baseCurrency()) {
          <div class="alert alert-warning small mb-0">
            Choose your base currency in Settings first — totals are reported in it.
          </div>
        }

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="tx-amount">
              Amount
              @if (currency(); as c) {
                <span class="text-body-secondary small">({{ c }})</span>
              }
            </label>
            <input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 1250.50"
              ngbAutofocus
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="tx-date">Day</label>
            <div class="input-group">
              <input
                id="tx-date"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('occurredOn')"
                formControlName="occurredOn"
                placeholder="e.g. 18/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #datePicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="datePicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('occurredOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>

        <div class="row g-3">
          @if (kind() !== 'Income') {
            <div class="col-sm-6">
              <label class="form-label" for="tx-from">
                {{ kind() === 'Transfer' ? 'From' : 'Paid from' }}
              </label>
              <select
                id="tx-from"
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
              <label class="form-label" for="tx-to">
                {{ kind() === 'Transfer' ? 'To' : 'Paid into' }}
              </label>
              <select
                id="tx-to"
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
                <label class="form-label" for="tx-currency">
                  {{ kind() === 'Income' ? 'Arrived in' : 'Paid in' }}
                </label>
                <select id="tx-currency" class="form-select" formControlName="moveCurrency">
                  @for (c of movingHeld(); track c) {
                    <option [ngValue]="c" [selected]="c === currency()">{{ c }}</option>
                  }
                </select>
              </div>
            }
            @if (arrivingHeld().length > 1) {
              <div class="col-sm-6">
                <label class="form-label" for="tx-arrive-currency">Arrives as</label>
                <select
                  id="tx-arrive-currency"
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
        @if (accounts().length === 0 && accountsLoaded()) {
          <p class="small text-body-secondary mb-0">
            Add an account first (Finance → Accounts) — every transaction moves money in or out of
            one.
          </p>
        }

        @if (needsToAmount()) {
          <div>
            <label class="form-label" for="tx-to-amount"> Arrived ({{ toCurrency() }}) </label>
            <input
              id="tx-to-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('toAmount')"
              formControlName="toAmount"
              placeholder="What landed in the other account"
            />
            @if (fieldError('toAmount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        @if (needsRate()) {
          <div>
            <label class="form-label" for="tx-rate"> Rate to {{ baseCurrency() }} </label>
            <input
              id="tx-rate"
              type="number"
              step="any"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('exchangeRate')"
              formControlName="exchangeRate"
              [placeholder]="'How many ' + baseCurrency() + ' one ' + currency() + ' was worth'"
            />
            @if (fieldError('exchangeRate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="tx-payee">
              {{ kind() === 'Income' ? 'From whom' : kind() === 'Transfer' ? 'Label' : 'Paid to' }}
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="tx-payee"
              type="text"
              class="form-control"
              formControlName="payee"
              [placeholder]="
                kind() === 'Income'
                  ? 'e.g. Acme Ltd'
                  : kind() === 'Transfer'
                    ? 'e.g. ATM'
                    : 'e.g. Big Basket'
              "
              autocomplete="off"
            />
          </div>
          @if (kind() === 'Income' && incomeOptions().length > 0) {
            <div class="col-sm-6">
              <label class="form-label" for="tx-for">
                What it's for <span class="text-body-secondary small">(optional)</span>
              </label>
              <select id="tx-for" class="form-select" formControlName="incomeFor">
                <option [ngValue]="''" [selected]="form.controls.incomeFor.value === ''">
                  Nothing in particular
                </option>
                @for (o of incomeOptions(); track o.value) {
                  <option
                    [ngValue]="o.value"
                    [selected]="o.value === form.controls.incomeFor.value"
                  >
                    {{ o.label }}
                  </option>
                }
              </select>
            </div>
          }
        </div>

        <div>
          <span class="form-label d-block">
            Tags <span class="text-body-secondary small">(what it was for — budgets use them)</span>
          </span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>

        <div class="row g-3">
          <div class="col-sm-8">
            <label class="form-label" for="tx-note">
              Note <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="tx-note"
              type="text"
              class="form-control"
              formControlName="note"
              placeholder="e.g. Weekly shop"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="tx-reference">
              Reference <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="tx-reference"
              type="text"
              class="form-control"
              formControlName="reference"
              placeholder="e.g. UPI 6141…"
              autocomplete="off"
            />
          </div>
        </div>

        @if (existing(); as t) {
          @if (t.recurringName) {
            <p class="small text-body-secondary mb-0">
              <i class="bi bi-arrow-repeat"></i> Written by "{{ t.recurringName }}".
            </p>
          }
          <div class="border-top pt-3">
            <app-attachments entityType="Transaction" [entityId]="t.id" label="Receipts" />
          </div>
          <div class="border-top pt-3">
            <app-linked-items entityType="Transaction" [entityId]="t.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Transaction"
              [entityId]="t.id"
              [entityTitle]="title(t)"
            />
          </div>
        }
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
export class TransactionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly careerService = inject(CareerService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = TRANSACTION_KINDS;
  protected readonly kindLabels = TRANSACTION_KIND_LABELS;
  protected readonly kindIcons = TRANSACTION_KIND_ICONS;
  protected readonly title = transactionTitle;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly existing = signal<Transaction | null>(null);
  protected readonly saving = signal(false);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly accountsLoaded = signal(false);
  protected readonly accounts = signal<Account[]>([]);
  private readonly rates = signal<ExchangeRate[]>([]);
  protected readonly baseCurrency = computed(
    () => this.settingsService.settings()?.baseCurrency ?? null,
  );

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<TransactionKind>('Expense'),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    occurredOn: this.fb.control<string | null>(todayIso(), Validators.required),
    fromAccountId: this.fb.control<number | null>(null),
    toAccountId: this.fb.control<number | null>(null),
    // Multi-currency accounts: the currency chosen to move in / arrive in (null: the account's main one).
    moveCurrency: this.fb.control<string | null>(null),
    arriveCurrency: this.fb.control<string | null>(null),
    toAmount: this.fb.control<number | null>(null, Validators.min(0.01)),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.00000001)),
    payee: this.fb.nonNullable.control('', Validators.maxLength(200)),
    incomeFor: this.fb.nonNullable.control<IncomeFor>(''),
    note: this.fb.nonNullable.control('', Validators.maxLength(1000)),
    reference: this.fb.nonNullable.control('', Validators.maxLength(100)),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  protected readonly kind = computed(() => this.value().kind ?? 'Expense');

  private readonly employments = toSignal(
    this.careerService.employments().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly sideIncome = toSignal(
    this.careerService.sideIncome().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly incomeOptions = computed(() => {
    if (this.settingsService.hiddenModules().has('Career')) {
      return [];
    }
    return [
      ...this.employments().map((e) => ({
        value: `e:${e.id}`,
        label: `Salary — ${e.role} at ${e.organisation}`,
      })),
      ...this.sideIncome().map((s) => ({ value: `s:${s.id}`, label: `Side income — ${s.name}` })),
    ];
  });

  /** Open accounts, plus whichever the transaction is already on (so editing an archived one still shows it). */
  protected readonly pickable = computed(() => {
    const t = this.existing();
    const kept = new Set([t?.fromAccountId, t?.toAccountId]);
    return this.accounts().filter((a) => !a.isArchived || kept.has(a.id));
  });

  private account(id: number | null | undefined): Account | undefined {
    return id == null ? undefined : this.accounts().find((a) => a.id === id);
  }

  /** The currencies the moving account holds (the one it leaves; for income, the one it lands in). */
  /** The currency the rate box was last filled for (by the master or the saved transaction). */
  private rateFilledFor: string | null = null;
  protected readonly held = heldCurrencies;
  protected readonly movingHeld = computed(() => {
    const v = this.value();
    return heldCurrencies(this.account(this.kind() === 'Income' ? v.toAccountId : v.fromAccountId));
  });
  /** A transfer's receiving account's currencies. */
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
  /** A rate is needed off the base currency — except into a base-currency account (the server works it out). */
  protected readonly needsRate = computed(() => {
    const base = this.baseCurrency();
    const currency = this.currency();
    if (!base || !currency || currency === base) {
      return false;
    }
    return !(this.needsToAmount() && this.toCurrency() === base);
  });

  constructor() {
    this.financeService.accounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.accountsLoaded.set(true);
        this.preselectOnlyAccount();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load your accounts.')),
    });
    // Switching between expense, income and transfer fills the newly shown account too.
    this.form.controls.kind.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.preselectOnlyAccount());
    // The rate box starts with the exchange-rate master's rate for the day (still editable — the transaction keeps
    // whatever is saved). Only an empty box is filled, so a typed rate is never overwritten.
    this.financeService
      .rates()
      .subscribe({ next: (rates) => this.rates.set(rates), error: () => undefined });
    effect(() => {
      const currency = this.currency();
      const day = this.value().occurredOn;
      if (!this.needsRate() || !currency || !day) {
        return;
      }
      const rate = rateOn(this.rates(), currency, day);
      untracked(() => {
        const control = this.form.controls.exchangeRate;
        // Refilled when the currency changes (a multi-currency account), unless a rate was typed by hand.
        // Only when something changes — setting the box re-runs this effect, so an unchanged write would loop.
        const stale = this.rateFilledFor !== currency || (control.value === null && rate !== null);
        if (!control.dirty && stale && control.value !== rate) {
          control.setValue(rate);
        }
        this.rateFilledFor = currency;
      });
    });
  }

  configure(options: TransactionEditorOptions): void {
    const t = options.transaction;
    // A saved transaction's rate counts as filled for its own currency, so opening it never replaces it.
    this.rateFilledFor = t?.currency ?? null;
    this.existing.set(t ?? null);
    this.tagIds.set(t?.tags.map((tag) => tag.id) ?? []);
    const kind = t?.kind ?? options.kind ?? 'Expense';
    const startOn = options.accountId ?? null;
    this.form.reset({
      kind,
      amount: t?.amount ?? null,
      occurredOn: t?.occurredOn ?? todayIso(),
      fromAccountId: t ? t.fromAccountId : kind !== 'Income' ? startOn : null,
      toAccountId: t ? t.toAccountId : kind === 'Income' ? startOn : null,
      toAmount: t?.toAmount ?? null,
      exchangeRate: t?.exchangeRate ?? null,
      moveCurrency: t?.currency ?? null,
      arriveCurrency: t ? (t.toCurrency ?? t.currency) : null,
      payee: t?.payee ?? '',
      incomeFor: t?.employmentId
        ? `e:${t.employmentId}`
        : t?.sideIncomeSourceId
          ? `s:${t.sideIncomeSourceId}`
          : '',
      note: t?.note ?? '',
      reference: t?.reference ?? '',
    });
  }

  /** With a single open account, a new transaction starts on it. */
  private preselectOnlyAccount(): void {
    const open = this.accounts().filter((a) => !a.isArchived);
    if (this.existing() || open.length !== 1) {
      return;
    }
    const kind = this.form.controls.kind.value;
    const control =
      kind === 'Income' ? this.form.controls.toAccountId : this.form.controls.fromAccountId;
    if (control.value === null) {
      control.setValue(open[0].id);
    }
  }

  protected fieldError(
    name: 'amount' | 'occurredOn' | 'fromAccountId' | 'toAccountId' | 'toAmount' | 'exchangeRate',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'occurredOn':
        return control.errors['required'] ? 'Say which day.' : dateFieldError(control.errors);
      case 'fromAccountId':
      case 'toAccountId':
        return control.errors['same'] ? 'Pick two different accounts.' : 'Choose an account.';
      case 'toAmount':
        return control.errors['required'] ? 'Say how much arrived.' : 'Has to be more than zero.';
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

  /** Requirements that depend on the kind and the accounts, set just before checking the form. */
  private applyConditionalRules(): void {
    const c = this.form.controls;
    const kind = c.kind.value;
    const required = (on: boolean, control: typeof c.fromAccountId | typeof c.toAmount) => {
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
  }

  protected submit(): void {
    this.applyConditionalRules();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const incomeFor = v.kind === 'Income' ? v.incomeFor : '';
    this.saving.set(true);
    this.financeService
      .saveTransaction(this.existing()?.id ?? null, {
        kind: v.kind,
        occurredOn: v.occurredOn!,
        amount: v.amount!,
        exchangeRate: this.needsRate() ? v.exchangeRate : null,
        toAmount: this.needsToAmount() ? v.toAmount : null,
        currency: this.movingHeld().length > 1 ? this.currency() : null,
        toCurrency: this.arrivingHeld().length > 1 ? this.toCurrency() : null,
        fromAccountId: v.kind === 'Income' ? null : v.fromAccountId,
        toAccountId: v.kind === 'Expense' ? null : v.toAccountId,
        payee: v.payee.trim() || null,
        note: v.note.trim() || null,
        reference: v.reference.trim() || null,
        employmentId: incomeFor.startsWith('e:') ? Number(incomeFor.slice(2)) : null,
        sideIncomeSourceId: incomeFor.startsWith('s:') ? Number(incomeFor.slice(2)) : null,
        tagIds: this.tagIds(),
      })
      .subscribe({
        next: (transaction) => this.activeModal.close({ kind: 'saved', transaction }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the transaction.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const t = this.existing();
    if (!t) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${transactionTitle(t)}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeTransaction(t.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the transaction.')),
    });
  }
}
