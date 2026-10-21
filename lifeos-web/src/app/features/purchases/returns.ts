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
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import { Purchase, PurchaseReturn, PurchasesService } from '../../core/services/purchases.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney, heldCurrencies } from '../finance/finance-view';
import { RETURN_STATE_LABELS } from './purchases-view';

/** Opens a return (new when missing, for `purchaseId` when given). Resolves true when anything changed. */
async function openReturnEditor(
  modal: NgbModal,
  item?: PurchaseReturn,
  purchaseId?: number,
): Promise<boolean> {
  const modalRef = modal.open(ReturnEditor, {
    ariaLabelledBy: 'return-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as ReturnEditor).configure(item, purchaseId);
  try {
    return (await modalRef.result) as boolean;
  } catch {
    return false;
  }
}

/**
 * A return: which purchase, why, the shop's return-by day (reminded N days before until it's sent back), the day it
 * went back, the refund expected — and, once it arrives, the refund recorded as one income in Finance.
 */
@Component({
  selector: 'app-return-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="return-editor-heading" class="modal-title h5">
          {{ item() ? 'Return: ' + item()!.purchaseTitle : 'Start a return' }}
        </h2>
        <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (!item()) {
          <div>
            <label class="form-label" for="return-purchase">Purchase</label>
            <ng-select
              labelForId="return-purchase"
              [class.is-invalid]="fieldError('purchaseId')"
              formControlName="purchaseId"
              placeholder="Choose…"
            >
              @for (p of purchases(); track p.id) {
                <ng-option [value]="p.id">
                  {{ p.title }}{{ p.store ? ' — ' + p.store : '' }} ({{ p.purchasedOn | date }})
                </ng-option>
              }
            </ng-select>
            @if (fieldError('purchaseId'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        } @else {
          <p class="small text-body-secondary mb-0">
            Bought {{ item()!.purchasedOn | date
            }}{{ item()!.store ? ' at ' + item()!.store : '' }} for
            {{ money(item()!.purchaseAmount, item()!.currency) }}.
          </p>
        }
        <div>
          <label class="form-label" for="return-reason">
            Why <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="return-reason"
            type="text"
            class="form-control"
            formControlName="reason"
            placeholder="e.g. Wrong size, arrived damaged"
            autocomplete="off"
          />
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-6">
              <label class="form-label" [for]="'return-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'return-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
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
            <label class="form-label" for="return-remind">Remind me</label>
            <div class="input-group">
              <input
                id="return-remind"
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
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="return-refund">
              Refund expected <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="return-refund"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('refundAmount')"
              formControlName="refundAmount"
              placeholder="e.g. what you paid"
            />
            @if (fieldError('refundAmount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="return-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="return-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Return number, pickup slot"
          ></textarea>
        </div>

        @if (item(); as r) {
          <section class="border-top pt-3" aria-labelledby="return-refund-heading">
            <h3 id="return-refund-heading" class="h6">Refund</h3>
            @if (r.refundedOn) {
              <p class="small mb-0">
                {{ money(r.refundAmount ?? 0, r.currency) }} arrived {{ r.refundedOn | date }}
                @if (r.refundAccountName) {
                  in {{ r.refundAccountName }} (in Finance)
                }
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 align-baseline ms-1"
                  (click)="undoRefund()"
                >
                  Not refunded after all
                </button>
              </p>
            } @else {
              <div class="row g-2 align-items-end" [formGroup]="refundForm">
                <div class="col-sm-3">
                  <label class="form-label small" for="refund-amount">Amount</label>
                  <input
                    id="refund-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control form-control-sm"
                    [class.is-invalid]="refundError()"
                    formControlName="amount"
                    placeholder="e.g. 2250"
                  />
                </div>
                <div class="col-sm-4">
                  <label class="form-label small" for="refund-on">Arrived on</label>
                  <div class="input-group input-group-sm">
                    <input
                      id="refund-on"
                      type="text"
                      class="form-control"
                      formControlName="day"
                      placeholder="e.g. 20/Oct/2026"
                      autocomplete="off"
                      ngbDatepicker
                      #refundPicker="ngbDatepicker"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick the day"
                      (click)="refundPicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                </div>
                <div class="col-sm-3">
                  <label class="form-label small" for="refund-account">Into</label>
                  <ng-select
                    labelForId="refund-account"
                    class="ng-select-sm"
                    formControlName="accountId"
                    placeholder="Not in Finance"
                  >
                    @for (a of payable(); track a.id) {
                      <ng-option [value]="a.id">
                        {{ a.name }}
                      </ng-option>
                    }
                  </ng-select>
                </div>
                <div class="col-sm-2">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm w-100"
                    (click)="refund()"
                  >
                    Refunded
                  </button>
                </div>
                @if (refundError(); as error) {
                  <div class="col-12 invalid-feedback d-block mt-0">{{ error }}</div>
                }
              </div>
            }
          </section>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Return"
              [entityId]="r.id"
              [entityTitle]="'Return: ' + r.purchaseTitle"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (item()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class ReturnEditor {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly money = formatMoney;
  protected readonly dateFields = [
    { name: 'returnBy', label: 'Return by', placeholder: "The shop's deadline" },
    { name: 'returnedOn', label: 'Sent back on', placeholder: 'Blank until it goes' },
  ] as const;
  protected readonly item = signal<PurchaseReturn | null>(null);
  protected readonly saving = signal(false);
  private changed = false;
  /** Purchases of the last 90 days to choose from. */
  protected readonly purchases = toSignal(
    this.purchasesService
      .purchases(addDaysIso(todayIso(), -90), todayIso())
      .pipe(catchError(() => of([] as Purchase[]))),
    { initialValue: [] as Purchase[] },
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
  protected readonly payable = computed(() => {
    const currency = this.item()?.currency;
    return this.accounts().filter((a) => !currency || heldCurrencies(a).includes(currency));
  });

  protected readonly form = this.fb.group({
    purchaseId: this.fb.control<number | null>(null, Validators.required),
    reason: this.fb.nonNullable.control('', Validators.maxLength(500)),
    returnBy: this.fb.control<string | null>(null),
    returnedOn: this.fb.control<string | null>(null),
    reminderDays: this.fb.control<number | null>(2, [Validators.min(0), Validators.max(365)]),
    refundAmount: this.fb.control<number | null>(null, Validators.min(0.01)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });
  protected readonly refundForm = this.fb.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    day: this.fb.control<string | null>(todayIso(), Validators.required),
    accountId: this.fb.control<number | null>(null),
  });

  configure(item?: PurchaseReturn, purchaseId?: number): void {
    this.item.set(item ?? null);
    this.form.reset({
      purchaseId: item?.purchaseId ?? purchaseId ?? null,
      reason: item?.reason ?? '',
      returnBy: item?.returnBy ?? null,
      returnedOn: item?.returnedOn ?? null,
      reminderDays: item ? item.reminderDays : 2,
      refundAmount: item?.refundAmount ?? null,
      notes: item?.notes ?? '',
    });
    this.refundForm.reset({
      amount: item?.refundAmount ?? item?.purchaseAmount ?? null,
      day: todayIso(),
      accountId: null,
    });
  }

  protected fieldError(
    name: 'purchaseId' | 'returnBy' | 'returnedOn' | 'reminderDays' | 'refundAmount',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'purchaseId':
        return 'Choose the purchase.';
      case 'reminderDays':
        return control.errors['day'] ? 'Reminders need a return-by day.' : '0 to 365 days.';
      case 'refundAmount':
        return 'Has to be more than zero.';
      default:
        return control.errors['future']
          ? 'That can’t be in the future.'
          : dateFieldError(control.errors);
    }
  }

  protected refundError(): string | null {
    const control = this.refundForm.controls.amount;
    return control.touched && control.errors ? 'Give the refund (more than zero).' : null;
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    this.form.controls.reminderDays.updateValueAndValidity();
    this.form.controls.returnedOn.updateValueAndValidity();
    if (v.reminderDays !== null && !v.returnBy) {
      this.form.controls.reminderDays.setErrors({ day: true });
    }
    if (v.returnedOn && v.returnedOn > todayIso()) {
      this.form.controls.returnedOn.setErrors({ future: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.purchasesService
      .saveReturn(this.item()?.id ?? null, {
        purchaseId: v.purchaseId!,
        reason: v.reason.trim() || null,
        returnBy: v.returnBy,
        returnedOn: v.returnedOn,
        refundAmount: v.refundAmount,
        reminderDays: v.reminderDays,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the return.'));
        },
      });
  }

  protected refund(): void {
    const item = this.item();
    const v = this.refundForm.getRawValue();
    if (!item || this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      return;
    }
    this.purchasesService
      .refund(item.id, {
        refundedOn: v.day!,
        amount: v.amount!,
        accountId: v.accountId,
        exchangeRate: null,
        today: todayIso(),
      })
      .subscribe({
        next: (updated) => {
          this.item.set(updated);
          this.changed = true;
          this.toast.success(
            v.accountId !== null ? 'Refund recorded in Finance.' : 'Refund noted.',
          );
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not record the refund.')),
      });
  }

  protected async undoRefund(): Promise<void> {
    const item = this.item();
    if (!item) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Not refunded after all?',
      text: item.refundTransactionId ? 'Its income in Finance is deleted.' : '',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.undoRefund(item.id, todayIso()).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.changed = true;
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not undo it.')),
    });
  }

  protected async remove(): Promise<void> {
    const item = this.item();
    if (!item) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Delete this return?',
      text: 'A refund that arrived stays in Finance.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removeReturn(item.id).subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }

  protected close(): void {
    if (this.changed) {
      this.activeModal.close(true);
    } else {
      this.activeModal.dismiss();
    }
  }
}

/** Returns: what to send back (return-by soonest), what's back with the refund to come, and what's done. */
@Component({
  selector: 'app-returns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Returns</h1>
          <p class="text-body-secondary mb-0 small">
            Send it back in time, and see the refund arrive.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Start a return
        </button>
      </div>
      @if (loadFailed() && !returns()) {
        <app-load-error message="Couldn't load your returns." (retry)="load()" />
      } @else if (returns(); as list) {
        @if (list.length === 0) {
          <p class="text-body-secondary">
            No returns. Start one from a recent purchase to be reminded before the shop's deadline.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (r of list; track r.id) {
                <li
                  class="list-group-item py-3"
                  [class.text-body-secondary]="r.state === 'Refunded'"
                >
                  <div class="d-flex flex-wrap gap-2 align-items-start">
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(r)"
                      >
                        {{ r.purchaseTitle }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ labels[r.state] }}
                        @if (r.store) {
                          · {{ r.store }}
                        }
                        @if (r.reason) {
                          · {{ r.reason }}
                        }
                      </div>
                    </div>
                    <div class="text-end small">
                      @if (r.state === 'Open' && r.returnBy) {
                        <div
                          [class.text-danger-emphasis]="r.dueSoon"
                          [class.fw-semibold]="r.dueSoon"
                        >
                          by {{ r.returnBy | date }}
                        </div>
                      } @else if (r.state === 'Missed') {
                        <div class="text-danger-emphasis">was due {{ r.returnBy | date }}</div>
                      } @else if (r.refundedOn) {
                        <div>
                          {{ money(r.refundAmount ?? 0, r.currency) }} on {{ r.refundedOn | date }}
                        </div>
                      } @else if (r.returnedOn) {
                        <div>sent {{ r.returnedOn | date }}</div>
                      }
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
export class Returns {
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** `?open=<id>` opens that return; `?purchase=<id>` starts one for that purchase. */
  readonly open = input<string>();
  readonly purchase = input<string>();

  protected readonly money = formatMoney;
  protected readonly labels = RETURN_STATE_LABELS;
  protected readonly returns = signal<PurchaseReturn[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    effect(() => {
      const openId = Number(this.open());
      const purchaseId = Number(this.purchase());
      if (openId || purchaseId) {
        untracked(() => {
          void this.router.navigate([], {
            queryParams: { open: null, purchase: null },
            replaceUrl: true,
          });
          if (purchaseId) {
            void this.start(purchaseId);
          } else {
            this.purchasesService.returns(todayIso()).subscribe((list) => {
              const item = list.find((r) => r.id === openId);
              if (item) {
                void this.edit(item);
              }
            });
          }
        });
      }
    });
    this.load();
  }

  protected load(): void {
    this.purchasesService
      .returns(todayIso())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (returns) => {
          this.returns.set(returns);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(item?: PurchaseReturn): Promise<void> {
    if (await openReturnEditor(this.modal, item)) {
      this.load();
      this.toast.success('Return saved.');
    }
  }

  private async start(purchaseId: number): Promise<void> {
    if (await openReturnEditor(this.modal, undefined, purchaseId)) {
      this.load();
      this.toast.success('Return started.');
    }
  }
}
