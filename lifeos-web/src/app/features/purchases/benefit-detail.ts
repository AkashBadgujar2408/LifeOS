import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { Observable, catchError, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import { BenefitDetail, PurchasesService } from '../../core/services/purchases.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { formatMoney, heldCurrencies } from '../finance/finance-view';
import { openBenefitEditor } from './benefit-editor';
import { BENEFIT_KIND_LABELS, benefitWorth } from './purchases-view';

/** Opens a reward's page-in-a-dialog. Resolves true when anything changed (the list reloads). */
export async function openBenefitDetail(modal: NgbModal, id: number): Promise<boolean> {
  const modalRef = modal.open(BenefitDetailDialog, {
    ariaLabelledBy: 'benefit-detail-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as BenefitDetailDialog).load(id);
  try {
    return (await modalRef.result) as boolean;
  } catch {
    return false;
  }
}

/**
 * One reward: what it's worth now, its code and PIN (hidden until asked), and what you do with it — use some (money,
 * a coupon once, points; points can be cashed in to an account as one income), add points as you earn them, or mark
 * cashback received (one income in Finance, undone by taking it back).
 */
@Component({
  selector: 'app-benefit-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <div class="modal-header">
      <h2 id="benefit-detail-heading" class="modal-title h5 text-break">
        {{ detail()?.benefit?.name ?? 'Reward' }}
      </h2>
      <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3">
      @if (detail(); as d) {
        @let b = d.benefit;
        <div>
          <div class="small text-body-secondary">
            {{ kindLabels[b.kind] }}
            @if (b.store) {
              · {{ b.kind === 'Points' ? 'programme' : 'at' }} {{ b.store }}
            }
            @if (b.purchaseTitle) {
              · from "{{ b.purchaseTitle }}"
            }
          </div>
          <div class="fs-5 fw-semibold">{{ worth() }}</div>
          <div class="small">
            @switch (b.status) {
              @case ('Usable') {
                @if (b.nextExpiry; as day) {
                  <span
                    [class.fw-semibold]="b.expiringSoon"
                    [class.text-danger-emphasis]="b.expiringSoon"
                  >
                    Runs out {{ day | date }}
                  </span>
                } @else {
                  Doesn't run out
                }
              }
              @case ('UsedUp') {
                Used up
              }
              @case ('Expired') {
                Ran out {{ b.lostOn | date }}
                @if (b.lost > 0) {
                  — {{ money(b.lost, b.currency) }} unused
                }
              }
              @case ('Pending') {
                @if (b.expectedBy) {
                  <span [class.text-danger-emphasis]="b.overdue" [class.fw-semibold]="b.overdue">
                    Expected by {{ b.expectedBy | date }}{{ b.overdue ? ' — overdue' : '' }}
                  </span>
                } @else {
                  Not received yet
                }
              }
              @case ('Received') {
                Received {{ b.receivedOn | date }}
                @if (b.transactionId) {
                  — in Finance
                }
              }
            }
            @if (b.kind === 'Points' && b.lost > 0) {
              · {{ money(b.lost, b.currency) }} of points ran out unused
            }
          </div>
        </div>

        @if (b.hasCode || b.hasPin) {
          <div class="border rounded p-2 d-flex flex-wrap gap-2 align-items-center">
            <span class="small text-body-secondary">Code</span>
            <span class="font-monospace flex-grow-1 text-break" aria-live="polite">
              {{ showCode() ? (b.code ?? '—') : '••••••••' }}
              @if (b.hasPin) {
                · PIN {{ showCode() ? b.pin : '••••' }}
              }
            </span>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              (click)="showCode.set(!showCode())"
            >
              {{ showCode() ? 'Hide' : 'Show' }}
            </button>
            @if (b.code) {
              <button type="button" class="btn btn-sm btn-outline-secondary" (click)="copy(b.code)">
                Copy
              </button>
            }
          </div>
        }

        @if (b.kind === 'Cashback') {
          <section class="border-top pt-3" aria-labelledby="benefit-received">
            <h3 id="benefit-received" class="h6">Received</h3>
            @if (b.receivedOn) {
              <p class="small mb-0">
                Arrived {{ b.receivedOn | date }}.
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 align-baseline"
                  (click)="undoReceived()"
                >
                  Not received after all
                </button>
              </p>
            } @else {
              <form
                class="row g-2 align-items-end"
                [formGroup]="receivedForm"
                (ngSubmit)="received()"
                novalidate
              >
                <div class="col-sm-4">
                  <label class="form-label small" for="received-on">Arrived on</label>
                  <div class="input-group input-group-sm">
                    <input
                      id="received-on"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="dayError(receivedForm.controls.day)"
                      formControlName="day"
                      placeholder="e.g. 20/Oct/2026"
                      autocomplete="off"
                      ngbDatepicker
                      #receivedPicker="ngbDatepicker"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick the day"
                      (click)="receivedPicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                  @if (dayError(receivedForm.controls.day); as error) {
                    <div class="invalid-feedback d-block">{{ error }}</div>
                  }
                </div>
                <div class="col-sm-5">
                  <label class="form-label small" for="received-account">Into</label>
                  <ng-select
                    labelForId="received-account"
                    class="ng-select-sm"
                    formControlName="accountId"
                    placeholder="Don't record it in Finance"
                  >
                    @for (a of payable(); track a.id) {
                      <ng-option [value]="a.id">
                        {{ a.name }}
                      </ng-option>
                    }
                  </ng-select>
                </div>
                <div class="col-sm-3">
                  <button type="submit" class="btn btn-primary btn-sm w-100">Mark received</button>
                </div>
              </form>
            }
          </section>
        } @else {
          @if (b.kind === 'Points') {
            <section class="border-top pt-3" aria-labelledby="benefit-earned">
              <h3 id="benefit-earned" class="h6">Points earned</h3>
              <form
                class="row g-2 align-items-end mb-2"
                [formGroup]="pointsForm"
                (ngSubmit)="addPoints()"
                novalidate
              >
                <div class="col-6 col-sm-3">
                  <label class="form-label small" for="points-earned">Points</label>
                  <input
                    id="points-earned"
                    type="number"
                    min="1"
                    step="1"
                    class="form-control form-control-sm"
                    [class.is-invalid]="pointsError()"
                    formControlName="points"
                    placeholder="e.g. 1200"
                  />
                </div>
                <div class="col-6 col-sm-4">
                  <label class="form-label small" for="points-on">Earned on</label>
                  <div class="input-group input-group-sm">
                    <input
                      id="points-on"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="dayError(pointsForm.controls.earnedOn)"
                      formControlName="earnedOn"
                      placeholder="e.g. 20/Oct/2026"
                      autocomplete="off"
                      ngbDatepicker
                      #earnedPicker="ngbDatepicker"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick the day"
                      (click)="earnedPicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                </div>
                <div class="col-sm-3">
                  <label class="form-label small" for="points-expire">Run out on</label>
                  <div class="input-group input-group-sm">
                    <input
                      id="points-expire"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="dayError(pointsForm.controls.expiresOn)"
                      formControlName="expiresOn"
                      placeholder="Never"
                      autocomplete="off"
                      ngbDatepicker
                      #pointsExpirePicker="ngbDatepicker"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick the day they run out"
                      (click)="pointsExpirePicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                </div>
                <div class="col-sm-2">
                  <button type="submit" class="btn btn-outline-primary btn-sm w-100">Add</button>
                </div>
                @if (
                  pointsError() ??
                    dayError(pointsForm.controls.earnedOn) ??
                    dayError(pointsForm.controls.expiresOn);
                  as error
                ) {
                  <div class="col-12 invalid-feedback d-block mt-0">{{ error }}</div>
                }
              </form>
              <ul class="list-unstyled small mb-0">
                @for (batch of d.batches; track batch.id) {
                  <li class="d-flex gap-2 align-items-baseline mb-1">
                    <span class="flex-grow-1">
                      {{ batch.points.toLocaleString('en-IN') }} on {{ batch.earnedOn | date }}
                      <span class="text-body-secondary">
                        — {{ batch.remaining.toLocaleString('en-IN') }} left
                        @if (batch.expiresOn) {
                          · run out {{ batch.expiresOn | date }}
                        }
                      </span>
                    </span>
                    <button
                      type="button"
                      class="btn btn-link btn-sm p-0 link-danger"
                      [attr.aria-label]="
                        'Remove the ' + batch.points + ' points of ' + (batch.earnedOn | date)
                      "
                      (click)="removePoints(batch.id)"
                    >
                      Remove
                    </button>
                  </li>
                } @empty {
                  <li class="text-body-secondary">None yet — add points as you earn them.</li>
                }
              </ul>
            </section>
          }

          <section class="border-top pt-3" aria-labelledby="benefit-uses">
            <h3 id="benefit-uses" class="h6">Used</h3>
            @if (b.status === 'Usable') {
              <form
                class="row g-2 align-items-end mb-2"
                [formGroup]="useForm"
                (ngSubmit)="use()"
                novalidate
              >
                <div class="col-6 col-sm-3">
                  <label class="form-label small" for="use-amount">
                    {{
                      b.kind === 'Points' ? 'Points' : b.kind === 'Coupon' ? 'It saved' : 'Amount'
                    }}
                  </label>
                  <input
                    id="use-amount"
                    type="number"
                    min="0"
                    [step]="b.kind === 'Points' ? 1 : 0.01"
                    class="form-control form-control-sm"
                    [class.is-invalid]="useError()"
                    formControlName="amount"
                    [placeholder]="b.kind === 'Points' ? 'e.g. 500' : 'e.g. 300'"
                  />
                </div>
                <div class="col-6 col-sm-4">
                  <label class="form-label small" for="use-on">On</label>
                  <div class="input-group input-group-sm">
                    <input
                      id="use-on"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="dayError(useForm.controls.day)"
                      formControlName="day"
                      placeholder="e.g. 20/Oct/2026"
                      autocomplete="off"
                      ngbDatepicker
                      #usePicker="ngbDatepicker"
                      container="body"
                    />
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      aria-label="Pick the day"
                      (click)="usePicker.toggle()"
                    >
                      <i class="bi bi-calendar3"></i>
                    </button>
                  </div>
                </div>
                @if (b.kind === 'Points') {
                  <div class="col-sm-3">
                    <label class="form-label small" for="use-cash">Cashed into</label>
                    <select
                      id="use-cash"
                      class="form-select form-select-sm"
                      formControlName="cashAccountId"
                    >
                      <option
                        [ngValue]="null"
                        [selected]="useForm.controls.cashAccountId.value === null"
                      >
                        Spent, not cashed
                      </option>
                      @for (a of payable(); track a.id) {
                        <option
                          [ngValue]="a.id"
                          [selected]="a.id === useForm.controls.cashAccountId.value"
                        >
                          {{ a.name }}
                        </option>
                      }
                    </select>
                  </div>
                }
                <div class="col-sm-2">
                  <button type="submit" class="btn btn-outline-primary btn-sm w-100">Record</button>
                </div>
                @if (useError() ?? dayError(useForm.controls.day); as error) {
                  <div class="col-12 invalid-feedback d-block mt-0">{{ error }}</div>
                }
              </form>
            }
            <ul class="list-unstyled small mb-0">
              @for (r of d.redemptions; track r.id) {
                <li class="d-flex gap-2 align-items-baseline mb-1">
                  <span class="flex-grow-1">
                    {{ r.redeemedOn | date }} —
                    @if (r.points !== null) {
                      {{ r.points.toLocaleString('en-IN') }} points
                    } @else {
                      {{ money(r.amount ?? 0, b.currency) }}
                    }
                    @if (r.purchaseTitle) {
                      <span class="text-body-secondary">on "{{ r.purchaseTitle }}"</span>
                    }
                    @if (r.transactionId) {
                      <span class="text-body-secondary">· cashed in to Finance</span>
                    }
                  </span>
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0 link-danger"
                    [attr.aria-label]="'Undo the use of ' + (r.redeemedOn | date)"
                    (click)="removeUse(r.id, r.transactionId !== null)"
                  >
                    Undo
                  </button>
                </li>
              } @empty {
                <li class="text-body-secondary">Not used yet.</li>
              }
            </ul>
          </section>
        }

        @if (b.notes) {
          <p class="small text-break mb-0 border-top pt-3">{{ b.notes }}</p>
        }
        <div class="border-top pt-3">
          <app-linked-items entityType="Benefit" [entityId]="b.id" />
        </div>
        <div class="border-top pt-3">
          <app-entity-reminders entityType="Benefit" [entityId]="b.id" [entityTitle]="b.name" />
        </div>
      } @else if (failed()) {
        <p class="text-body-secondary">Couldn't load this reward.</p>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
    <div class="modal-footer">
      @if (detail()) {
        <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
          <i class="bi bi-trash"></i> Delete
        </button>
        <button type="button" class="btn btn-outline-primary" (click)="edit()">
          <i class="bi bi-pencil"></i> Edit
        </button>
      }
      <button type="button" class="btn btn-outline-secondary" (click)="close()">Close</button>
    </div>
  `,
})
export class BenefitDetailDialog {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kindLabels = BENEFIT_KIND_LABELS;
  protected readonly detail = signal<BenefitDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly showCode = signal(false);
  private changed = false;

  private readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(
        map((accounts) => accounts.filter((a) => !a.isArchived)),
        catchError(() => of([])),
      ),
    { initialValue: [] },
  );
  /** Accounts that hold the reward's currency (for cashback and cashed-in points). */
  protected readonly payable = computed(() => {
    const currency = this.detail()?.benefit.currency;
    return this.accounts().filter((a) => !currency || heldCurrencies(a).includes(currency));
  });
  protected readonly worth = computed(() => {
    const b = this.detail()?.benefit;
    return b ? benefitWorth(b) : '';
  });

  protected readonly useForm = this.fb.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    day: this.fb.control<string | null>(todayIso(), Validators.required),
    cashAccountId: this.fb.control<number | null>(null),
  });
  protected readonly pointsForm = this.fb.group({
    points: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    earnedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    expiresOn: this.fb.control<string | null>(null),
  });
  protected readonly receivedForm = this.fb.group({
    day: this.fb.control<string | null>(todayIso(), Validators.required),
    accountId: this.fb.control<number | null>(null),
  });

  protected money(amount: number, currency: string | null): string {
    return formatMoney(amount, currency ?? 'INR');
  }

  load(id: number): void {
    this.purchasesService.benefit(id, todayIso()).subscribe({
      next: (detail) => this.detail.set(detail),
      error: () => this.failed.set(true),
    });
  }

  protected dayError(control: {
    touched: boolean;
    errors: Record<string, unknown> | null;
  }): string | null {
    if (!control.touched || !control.errors) {
      return null;
    }
    return control.errors['required']
      ? 'Say which day.'
      : control.errors['future']
        ? 'That can’t be in the future.'
        : dateFieldError(control.errors);
  }

  protected useError(): string | null {
    const control = this.useForm.controls.amount;
    return control.touched && control.errors ? 'Give how much (more than zero).' : null;
  }

  protected pointsError(): string | null {
    const control = this.pointsForm.controls.points;
    return control.touched && control.errors ? 'Give how many points (more than zero).' : null;
  }

  protected use(): void {
    const b = this.detail()?.benefit;
    const v = this.useForm.getRawValue();
    if (!b || !this.validDay(this.useForm.controls.day) || this.useForm.invalid) {
      this.useForm.markAllAsTouched();
      return;
    }
    const points = b.kind === 'Points';
    this.apply(
      this.purchasesService.redeem(b.id, {
        redeemedOn: v.day!,
        amount: points ? null : v.amount,
        points: points ? Math.round(v.amount!) : null,
        notes: null,
        cashIn:
          points && v.cashAccountId !== null
            ? { accountId: v.cashAccountId, exchangeRate: null }
            : null,
        today: todayIso(),
      }),
      'Could not record it.',
      () => this.useForm.reset({ amount: null, day: todayIso(), cashAccountId: null }),
    );
  }

  protected addPoints(): void {
    const b = this.detail()?.benefit;
    const v = this.pointsForm.getRawValue();
    if (!b || !this.validDay(this.pointsForm.controls.earnedOn) || this.pointsForm.invalid) {
      this.pointsForm.markAllAsTouched();
      return;
    }
    this.apply(
      this.purchasesService.addPoints(b.id, {
        earnedOn: v.earnedOn!,
        points: Math.round(v.points!),
        expiresOn: v.expiresOn,
        notes: null,
        today: todayIso(),
      }),
      'Could not add the points.',
      () => this.pointsForm.reset({ points: null, earnedOn: todayIso(), expiresOn: null }),
    );
  }

  protected received(): void {
    const b = this.detail()?.benefit;
    const v = this.receivedForm.getRawValue();
    if (!b || !this.validDay(this.receivedForm.controls.day) || this.receivedForm.invalid) {
      this.receivedForm.markAllAsTouched();
      return;
    }
    this.apply(
      this.purchasesService.markReceived(b.id, {
        receivedOn: v.day!,
        accountId: v.accountId,
        exchangeRate: null,
        today: todayIso(),
      }),
      'Could not mark it received.',
    );
  }

  protected async undoReceived(): Promise<void> {
    const b = this.detail()?.benefit;
    if (
      b &&
      (await this.confirm(
        'Not received after all?',
        b.transactionId ? 'Its income in Finance is deleted.' : '',
      ))
    ) {
      this.apply(this.purchasesService.undoReceived(b.id, todayIso()), 'Could not undo it.');
    }
  }

  protected async removeUse(redemptionId: number, cashedIn: boolean): Promise<void> {
    const b = this.detail()?.benefit;
    if (
      b &&
      (await this.confirm(
        'Undo this use?',
        cashedIn ? 'The income it became in Finance is deleted too.' : '',
      ))
    ) {
      this.apply(
        this.purchasesService.removeRedemption(b.id, redemptionId, todayIso()),
        'Could not undo it.',
      );
    }
  }

  protected async removePoints(batchId: number): Promise<void> {
    const b = this.detail()?.benefit;
    if (b && (await this.confirm('Remove these points?', ''))) {
      this.apply(
        this.purchasesService.removePoints(b.id, batchId, todayIso()),
        'Could not remove them.',
      );
    }
  }

  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.success('Code copied.');
    } catch {
      this.toast.error('Could not copy — select the code instead.');
    }
  }

  protected async edit(): Promise<void> {
    const d = this.detail();
    if (!d) {
      return;
    }
    const updated = await openBenefitEditor(this.modal, d.benefit);
    if (updated) {
      this.detail.set(updated);
      this.changed = true;
    }
  }

  protected async remove(): Promise<void> {
    const b = this.detail()?.benefit;
    if (!b) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${b.name}"?`,
      text: 'Money that moved in Finance (a purchase, cashback received, points cashed in) stays there.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removeBenefit(b.id).subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }

  protected close(): void {
    this.activeModal.close(this.changed);
  }

  /** A required day, not ahead of today. */
  private validDay(control: {
    value: string | null;
    setErrors(errors: Record<string, unknown> | null): void;
  }): boolean {
    if (control.value && control.value > todayIso()) {
      control.setErrors({ future: true });
      return false;
    }
    return true;
  }

  private async confirm(title: string, text: string): Promise<boolean> {
    const answer = await Swal.fire({
      title,
      text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      confirmButtonColor: 'var(--lifeos-teal-strong)',
    });
    return answer.isConfirmed;
  }

  /** Runs a change that returns the whole reward and shows it. */
  private apply(request: Observable<BenefitDetail>, failure: string, done?: () => void): void {
    request.subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.changed = true;
        done?.();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, failure)),
    });
  }
}
