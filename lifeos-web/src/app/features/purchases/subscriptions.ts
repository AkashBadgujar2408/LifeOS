import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import {
  PurchasesService,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_STATUSES,
  Subscription,
  SubscriptionFrequency,
  SubscriptionStatus,
  SubscriptionsOverview,
} from '../../core/services/purchases.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney, heldCurrencies } from '../finance/finance-view';
import { everyText } from './purchases-view';

/** Opens a subscription (new when missing). Resolves true when saved or deleted. */
async function openSubscriptionEditor(
  modal: NgbModal,
  subscription?: Subscription,
): Promise<boolean> {
  const modalRef = modal.open(SubscriptionEditor, {
    ariaLabelledBy: 'subscription-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as SubscriptionEditor).configure(subscription);
  try {
    return (await modalRef.result) as boolean;
  } catch {
    return false;
  }
}

const dateFields = [
  { name: 'startedOn', label: 'First charged on', placeholder: 'e.g. 20/Jan/2025' },
  { name: 'cancelBy', label: 'Decide by', placeholder: 'Trial end, renewal (optional)' },
] as const;

/**
 * A subscription: what it costs and how often, from when; charged to an account, each charge is written to Finance
 * from today on; a renewal reminder N days before each charge; a decide-by day for trials. Pausing pauses the charges,
 * cancelling stops them from that day.
 */
@Component({
  selector: 'app-subscription-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="subscription-editor-heading" class="modal-title h5">
          {{ subscription() ? 'Subscription' : 'Add a subscription' }}
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
          <div class="col-sm-6">
            <label class="form-label" for="sub-name">Name</label>
            <input
              id="sub-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Netflix"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="sub-provider">
              Provider <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="sub-provider"
              type="text"
              class="form-control"
              formControlName="provider"
              placeholder="e.g. Netflix India"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-6 col-sm-3">
            <label class="form-label" for="sub-amount">Amount</label>
            <input
              id="sub-amount"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 649"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="sub-currency">Currency</label>
            <ng-select labelForId="sub-currency" formControlName="currency" [clearable]="false">
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="sub-interval">Every</label>
            <input
              id="sub-interval"
              type="number"
              min="1"
              max="99"
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
            <label class="form-label" for="sub-frequency">
              <span class="visually-hidden">Unit</span>&nbsp;
            </label>
            <select id="sub-frequency" class="form-select" formControlName="recurrenceFrequency">
              @for (f of frequencies; track f) {
                <option [ngValue]="f" [selected]="f === form.controls.recurrenceFrequency.value">
                  {{ unitLabels[f] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-6">
              <label class="form-label" [for]="'sub-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'sub-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
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
          <div class="col-sm-6">
            <label class="form-label" for="sub-account">Charged to</label>
            <ng-select
              labelForId="sub-account"
              formControlName="accountId"
              placeholder="Don't record charges in Finance"
            >
              @for (a of payableAccounts(); track a.id) {
                <ng-option [value]="a.id">
                  {{ a.name }}
                </ng-option>
              }
            </ng-select>
            <div class="form-text">
              Each charge from today on becomes an expense in your ledger.
            </div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="sub-remind">Remind me</label>
            <div class="input-group">
              <input
                id="sub-remind"
                type="number"
                min="0"
                max="365"
                class="form-control"
                [class.is-invalid]="fieldError('reminderDays')"
                formControlName="reminderDays"
                placeholder="Blank: no reminder"
              />
              <span class="input-group-text">days before each charge</span>
            </div>
            @if (fieldError('reminderDays'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        @if (needsRate() && form.controls.accountId.value !== null) {
          <div>
            <label class="form-label" for="sub-rate">
              Rate to {{ baseCurrency() }}
              <span class="text-body-secondary small"
                >(1 {{ form.controls.currency.value }} =)</span
              >
            </label>
            <input
              id="sub-rate"
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
        @if (subscription()) {
          <div class="row g-3">
            <div class="col-sm-6">
              <label class="form-label" for="sub-status">Status</label>
              <select id="sub-status" class="form-select" formControlName="status">
                @for (s of statuses; track s) {
                  <option [ngValue]="s" [selected]="s === form.controls.status.value">
                    {{ s }}
                  </option>
                }
              </select>
            </div>
            @if (form.controls.status.value === 'Cancelled') {
              <div class="col-sm-6">
                <label class="form-label" for="sub-cancelled">Cancelled on</label>
                <div class="input-group">
                  <input
                    id="sub-cancelled"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="fieldError('cancelledOn')"
                    formControlName="cancelledOn"
                    placeholder="e.g. 20/Oct/2026"
                    autocomplete="off"
                    ngbDatepicker
                    #cancelPicker="ngbDatepicker"
                    [minDate]="minDate"
                    container="body"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    aria-label="Pick the day it was cancelled"
                    (click)="cancelPicker.toggle()"
                  >
                    <i class="bi bi-calendar3"></i>
                  </button>
                </div>
                @if (fieldError('cancelledOn'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
            }
          </div>
        }
        <div>
          <label class="form-label" for="sub-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="sub-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Plan, how to cancel"
          ></textarea>
        </div>
        @if (subscription(); as s) {
          <div class="border-top pt-3">
            <app-linked-items entityType="Subscription" [entityId]="s.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Subscription"
              [entityId]="s.id"
              [entityTitle]="s.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (subscription()) {
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
export class SubscriptionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly dateFields = dateFields;
  protected readonly frequencies = SUBSCRIPTION_FREQUENCIES;
  protected readonly statuses = SUBSCRIPTION_STATUSES;
  protected readonly unitLabels: Record<SubscriptionFrequency, string> = {
    Weekly: 'week(s)',
    Monthly: 'month(s)',
    Yearly: 'year(s)',
  };
  protected readonly minDate = { year: 1990, month: 1, day: 1 };
  protected readonly subscription = signal<Subscription | null>(null);
  protected readonly saving = signal(false);
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(
        map((accounts) => accounts.filter((a) => !a.isArchived)),
        catchError(() => of([])),
      ),
    { initialValue: [] },
  );
  protected readonly baseCurrency = computed(() => this.settingsService.settings()?.baseCurrency);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    provider: this.fb.nonNullable.control('', Validators.maxLength(200)),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    currency: this.fb.nonNullable.control(''),
    recurrenceFrequency: this.fb.nonNullable.control<SubscriptionFrequency>('Monthly'),
    recurrenceInterval: this.fb.control<number | null>(1, [
      Validators.required,
      Validators.min(1),
      Validators.max(99),
    ]),
    startedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    cancelBy: this.fb.control<string | null>(null),
    status: this.fb.nonNullable.control<SubscriptionStatus>('Active'),
    cancelledOn: this.fb.control<string | null>(null),
    accountId: this.fb.control<number | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.000001)),
    reminderDays: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(365)]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  private readonly currency = toSignal(this.form.controls.currency.valueChanges, {
    initialValue: '',
  });
  protected readonly needsRate = computed(
    () => !!this.currency() && !!this.baseCurrency() && this.currency() !== this.baseCurrency(),
  );
  protected readonly payableAccounts = computed(() =>
    this.accounts().filter((a) => !this.currency() || heldCurrencies(a).includes(this.currency())),
  );

  configure(subscription?: Subscription): void {
    this.subscription.set(subscription ?? null);
    this.form.reset({
      name: subscription?.name ?? '',
      provider: subscription?.provider ?? '',
      amount: subscription?.amount ?? null,
      currency: subscription?.currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR',
      recurrenceFrequency: subscription?.recurrenceFrequency ?? 'Monthly',
      recurrenceInterval: subscription?.recurrenceInterval ?? 1,
      startedOn: subscription?.startedOn ?? todayIso(),
      cancelBy: subscription?.cancelBy ?? null,
      status: subscription?.status ?? 'Active',
      cancelledOn: subscription?.cancelledOn ?? null,
      accountId: subscription?.accountId ?? null,
      exchangeRate: null,
      reminderDays: subscription?.reminderDays ?? null,
      notes: subscription?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'amount'
      | 'recurrenceInterval'
      | 'startedOn'
      | 'cancelBy'
      | 'cancelledOn'
      | 'exchangeRate'
      | 'reminderDays',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name it (e.g. Netflix).' : 'That is too long.';
      case 'amount':
        return control.errors['required']
          ? 'Give what each charge is.'
          : 'Has to be more than zero.';
      case 'recurrenceInterval':
        return 'Every 1 to 99.';
      case 'startedOn':
        return control.errors['required']
          ? 'Say when it was first charged.'
          : dateFieldError(control.errors);
      case 'cancelledOn':
        return control.errors['required']
          ? 'Say when it was cancelled.'
          : control.errors['future']
            ? 'Set it on the day it stops (use "decide by" for a day ahead).'
            : dateFieldError(control.errors);
      case 'exchangeRate':
        return 'Give the rate — or don’t record charges in Finance.';
      case 'reminderDays':
        return '0 to 365 days.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    this.form.controls.cancelledOn.updateValueAndValidity();
    this.form.controls.exchangeRate.updateValueAndValidity();
    if (v.status === 'Cancelled' && !v.cancelledOn) {
      this.form.controls.cancelledOn.setErrors({ required: true });
    } else if (v.status === 'Cancelled' && v.cancelledOn! > todayIso()) {
      this.form.controls.cancelledOn.setErrors({ future: true });
    }
    if (v.accountId !== null && this.needsRate() && v.exchangeRate === null) {
      this.form.controls.exchangeRate.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.purchasesService
      .saveSubscription(this.subscription()?.id ?? null, {
        name: v.name,
        provider: v.provider.trim() || null,
        amount: v.amount!,
        currency: v.currency,
        recurrenceFrequency: v.recurrenceFrequency,
        recurrenceInterval: v.recurrenceInterval!,
        startedOn: v.startedOn!,
        status: v.status,
        cancelledOn: v.status === 'Cancelled' ? v.cancelledOn : null,
        cancelBy: v.cancelBy,
        accountId: v.accountId,
        exchangeRate: v.accountId !== null && this.needsRate() ? v.exchangeRate : null,
        reminderDays: v.reminderDays,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the subscription.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const subscription = this.subscription();
    if (!subscription) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${subscription.name}"?`,
      text: 'No more charges are written to Finance; the ones already there stay. To keep its history, cancel it instead.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removeSubscription(subscription.id).subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }
}

/** Subscriptions: what they cost a month and a year, the next charge of each, decide-by days for trials. */
@Component({
  selector: 'app-subscriptions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Subscriptions</h1>
          <p class="text-body-secondary mb-0 small">
            What keeps charging you, what it adds up to, and when to decide.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a subscription
        </button>
      </div>

      @if (loadFailed() && !overview()) {
        <app-load-error message="Couldn't load your subscriptions." (retry)="load()" />
      } @else if (overview(); as o) {
        @if (o.subscriptions.length === 0) {
          <p class="text-body-secondary">
            No subscriptions yet. Add one to see what they add up to, be reminded before each
            charge, and have every charge land in Finance.
          </p>
        } @else {
          <div class="row g-3 mb-4">
            <div class="col-sm-6">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">A month</h2>
                  @for (t of o.totals; track t.currency) {
                    <div class="fs-5 fw-semibold">{{ money(t.monthly, t.currency) }}</div>
                  } @empty {
                    <div class="fs-5 fw-semibold">—</div>
                  }
                  <div class="small text-body-secondary">on average, active ones</div>
                </div>
              </section>
            </div>
            <div class="col-sm-6">
              <section class="card h-100">
                <div class="card-body">
                  <h2 class="h6 text-body-secondary mb-1">A year</h2>
                  @for (t of o.totals; track t.currency) {
                    <div class="fs-5 fw-semibold">{{ money(t.yearly, t.currency) }}</div>
                  } @empty {
                    <div class="fs-5 fw-semibold">—</div>
                  }
                  <div class="small text-body-secondary">at today's prices</div>
                </div>
              </section>
            </div>
          </div>
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (s of o.subscriptions; track s.id) {
                <li
                  class="list-group-item py-3"
                  [class.text-body-secondary]="s.status !== 'Active'"
                >
                  <div class="d-flex flex-wrap gap-2 align-items-start">
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(s)"
                      >
                        {{ s.name }}
                      </button>
                      @if (s.status !== 'Active') {
                        <span class="badge text-bg-light border ms-1">{{ s.status }}</span>
                      }
                      <div class="small text-body-secondary">
                        {{ money(s.amount, s.currency) }}
                        {{ every(s.recurrenceFrequency, s.recurrenceInterval) }}
                        @if (s.accountName) {
                          · charged to {{ s.accountName }}
                        }
                      </div>
                      @if (s.cancelBy && s.status !== 'Cancelled') {
                        <div
                          class="small"
                          [class.text-danger-emphasis]="s.decideSoon"
                          [class.fw-semibold]="s.decideSoon"
                        >
                          Decide by {{ s.cancelBy | date }}
                        </div>
                      }
                    </div>
                    <div class="text-end small">
                      @if (s.nextCharge) {
                        <div class="fw-semibold">next {{ s.nextCharge | date }}</div>
                      } @else if (s.status === 'Cancelled') {
                        <div>cancelled {{ s.cancelledOn | date }}</div>
                      }
                      <div class="text-body-secondary">
                        ≈ {{ money(s.monthlyCost, s.currency) }} a month
                      </div>
                    </div>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Subscriptions {
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** `?open=<id>` (from search, a reminder or the calendar) opens that subscription. */
  readonly open = input<string>();

  protected readonly money = formatMoney;
  protected readonly every = everyText;
  protected readonly overview = signal<SubscriptionsOverview | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    effect(() => {
      const id = Number(this.open());
      if (id) {
        untracked(() => {
          void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
          this.purchasesService.subscription(id, todayIso()).subscribe({
            next: (subscription) => void this.edit(subscription),
            error: (err) =>
              this.toast.error(apiErrorMessage(err, 'Could not open the subscription.')),
          });
        });
      }
    });
    this.load();
  }

  protected load(): void {
    this.purchasesService
      .subscriptions(todayIso())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (overview) => {
          this.overview.set(overview);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(subscription?: Subscription): Promise<void> {
    if (await openSubscriptionEditor(this.modal, subscription)) {
      this.load();
      this.toast.success('Subscriptions saved.');
    }
  }
}
