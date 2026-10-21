import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  Employment,
  PromotionResult,
  SALARY_PERIODS,
  SalaryPeriod,
} from '../../core/services/career.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { SALARY_PERIOD_LABELS } from './career-view';

/**
 * Records a promotion from a current role: resolves with the result (old role ended, new role, achievement, pay),
 * or null if dismissed. `currency` is the one to offer first (the latest pay's, else the base currency).
 */
export async function openPromotionDialog(
  modal: NgbModal,
  role: Employment,
  currency: string | null,
): Promise<PromotionResult | null> {
  const modalRef = modal.open(PromotionDialog, { ariaLabelledBy: 'promotion-heading' });
  (modalRef.componentInstance as PromotionDialog).configure(role, currency);
  try {
    return (await modalRef.result) as PromotionResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-promotion-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="promotion-heading" class="modal-title h5">Record a promotion</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (role(); as role) {
          <p class="small text-body-secondary mb-0">
            From <span class="fw-semibold">{{ role.role }}</span> at {{ role.organisation }}. That
            role ends the day before; the new one starts on the day you pick, and the promotion goes
            into your achievements and your story.
          </p>
        }
        <div>
          <label class="form-label" for="promo-role">New role</label>
          <input
            id="promo-role"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('newRole')"
            formControlName="newRole"
            placeholder="e.g. Senior Developer"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('newRole'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="promo-on">From</label>
          <div class="input-group">
            <input
              id="promo-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('on')"
              formControlName="on"
              placeholder="e.g. 01/Apr/2024"
              autocomplete="off"
              ngbDatepicker
              #onPicker="ngbDatepicker"
              [minDate]="minDate"
              [maxDate]="maxDate"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day"
              (click)="onPicker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fieldError('on'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <fieldset>
          <legend class="form-label fs-6 mb-1">
            New pay <span class="text-body-secondary small">(optional)</span>
          </legend>
          <div class="row g-2">
            <div class="col-sm-5">
              <label class="visually-hidden" for="promo-amount">Amount</label>
              <input
                id="promo-amount"
                type="number"
                min="0"
                step="any"
                class="form-control"
                [class.is-invalid]="fieldError('amount')"
                formControlName="amount"
                placeholder="e.g. 1650000"
              />
            </div>
            <div class="col-6 col-sm-3">
              <label class="visually-hidden" for="promo-currency">Currency</label>
              <ng-select labelForId="promo-currency" formControlName="currency" [clearable]="false">
                @for (c of currencies(); track c.code) {
                  <ng-option [value]="c.code">
                    {{ c.code }}
                  </ng-option>
                }
              </ng-select>
            </div>
            <div class="col-6 col-sm-4">
              <label class="visually-hidden" for="promo-period">Per</label>
              <select id="promo-period" class="form-select" formControlName="period">
                @for (p of periods; track p) {
                  <option [ngValue]="p" [selected]="p === form.controls.period.value">
                    {{ periodLabels[p] }}
                  </option>
                }
              </select>
            </div>
          </div>
          @if (fieldError('amount'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </fieldset>
        <div>
          <label class="form-label" for="promo-note">
            The story behind it <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="promo-note"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('note')"
            formControlName="note"
            placeholder="What led to it"
          ></textarea>
          @if (fieldError('note'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          Record promotion
        </button>
      </div>
    </form>
  `,
})
export class PromotionDialog {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly periods = SALARY_PERIODS;
  protected readonly periodLabels = SALARY_PERIOD_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly role = signal<Employment | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    newRole: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    on: this.fb.control<string | null>(todayIso(), Validators.required),
    amount: this.fb.control<number | null>(null, Validators.min(0.0001)),
    currency: this.fb.nonNullable.control('INR'),
    period: this.fb.nonNullable.control<SalaryPeriod>('Year'),
    note: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(role: Employment, currency: string | null): void {
    this.role.set(role);
    this.form.controls.currency.setValue(
      currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR',
    );
  }

  protected fieldError(name: 'newRole' | 'on' | 'amount' | 'note'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'on') {
      return control.errors['required']
        ? 'When does the new role start?'
        : dateFieldError(control.errors);
    }
    if (name === 'amount') {
      return 'Enter an amount above zero, or leave it blank.';
    }
    if (control.errors['required']) {
      return 'Name the new role.';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    const newRole = this.form.controls.newRole;
    newRole.setValue(newRole.value.trim());
    const role = this.role();
    if (this.form.invalid || !role) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .promote(role.id, {
        newRole: v.newRole,
        on: v.on!,
        note: v.note.trim() || null,
        salary: v.amount ? { amount: v.amount, currency: v.currency, period: v.period } : null,
        today: todayIso(),
      })
      .subscribe({
        next: (result) => this.activeModal.close(result),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not record the promotion.'));
        },
      });
  }
}
