import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  Employment,
  SALARY_PERIODS,
  SALARY_REASONS,
  SalaryPeriod,
  SalaryReason,
  SalaryRecord,
} from '../../core/services/career.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { SALARY_PERIOD_LABELS, SALARY_REASON_LABELS } from './career-view';

export type SalaryEditorResult = { kind: 'saved'; record: SalaryRecord } | { kind: 'deleted' };

/**
 * Opens the pay dialog (new when `record` is missing); `roles` fill the role picker and `currency` is offered first
 * for a new record. Resolves with what happened, or null if dismissed.
 */
export async function openSalaryEditor(
  modal: NgbModal,
  roles: readonly Employment[],
  record?: SalaryRecord,
  currency?: string | null,
): Promise<SalaryEditorResult | null> {
  const modalRef = modal.open(SalaryEditor, { ariaLabelledBy: 'salary-editor-heading' });
  (modalRef.componentInstance as SalaryEditor).configure(roles, record, currency ?? null);
  try {
    return (await modalRef.result) as SalaryEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-salary-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="salary-editor-heading" class="modal-title h5">
          {{ record() ? 'Edit pay' : 'Record pay' }}
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
          <label class="form-label" for="salary-role">Role</label>
          <select id="salary-role" class="form-select" formControlName="employmentId">
            <option [ngValue]="null">No particular role</option>
            @for (role of roles(); track role.id) {
              <option [ngValue]="role.id" [selected]="role.id === form.controls.employmentId.value">
                {{ role.role }} at {{ role.organisation }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="salary-on">From</label>
          <div class="input-group">
            <input
              id="salary-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('effectiveOn')"
              formControlName="effectiveOn"
              placeholder="e.g. 01/Apr/2023"
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
          @if (fieldError('effectiveOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-2">
          <div class="col-sm-5">
            <label class="form-label" for="salary-amount">Amount</label>
            <input
              id="salary-amount"
              type="number"
              min="0"
              step="any"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 1320000"
            />
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="salary-currency">Currency</label>
            <ng-select labelForId="salary-currency" formControlName="currency" [clearable]="false">
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label" for="salary-period">Per</label>
            <select id="salary-period" class="form-select" formControlName="period">
              @for (p of periods; track p) {
                <option [ngValue]="p" [selected]="p === form.controls.period.value">
                  {{ periodLabels[p] }}
                </option>
              }
            </select>
          </div>
        </div>
        @if (fieldError('amount'); as error) {
          <div class="invalid-feedback d-block mt-n2">{{ error }}</div>
        }
        <div>
          <label class="form-label" for="salary-reason">Why it changed</label>
          <select id="salary-reason" class="form-select" formControlName="reason">
            @for (r of reasons; track r) {
              <option [ngValue]="r" [selected]="r === form.controls.reason.value">
                {{ reasonLabels[r] }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="salary-note">
            Note <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="salary-note"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('note')"
            formControlName="note"
            placeholder="e.g. Annual review, includes the market correction"
            autocomplete="off"
          />
          @if (fieldError('note'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (record()) {
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
export class SalaryEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly periods = SALARY_PERIODS;
  protected readonly periodLabels = SALARY_PERIOD_LABELS;
  protected readonly reasons = SALARY_REASONS;
  protected readonly reasonLabels = SALARY_REASON_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly roles = signal<readonly Employment[]>([]);
  protected readonly record = signal<SalaryRecord | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    employmentId: this.fb.control<number | null>(null),
    effectiveOn: this.fb.control<string | null>(null, Validators.required),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
    currency: this.fb.nonNullable.control('INR'),
    period: this.fb.nonNullable.control<SalaryPeriod>('Year'),
    reason: this.fb.nonNullable.control<SalaryReason>('Starting'),
    note: this.fb.nonNullable.control('', Validators.maxLength(1000)),
  });

  configure(roles: readonly Employment[], record?: SalaryRecord, currency?: string | null): void {
    this.roles.set(roles);
    this.record.set(record ?? null);
    const current = roles.find((r) => r.endDate === null);
    this.form.reset({
      employmentId: record ? record.employmentId : (current?.id ?? null),
      effectiveOn: record?.effectiveOn ?? null,
      amount: record?.amount ?? null,
      currency:
        record?.currency ?? currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR',
      period: record?.period ?? 'Year',
      reason: record?.reason ?? (current ? 'Raise' : 'Starting'),
      note: record?.note ?? '',
    });
  }

  protected fieldError(name: 'effectiveOn' | 'amount' | 'note'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'effectiveOn') {
      return control.errors['required']
        ? 'From which day is this the pay?'
        : dateFieldError(control.errors);
    }
    if (name === 'amount') {
      return 'Enter an amount above zero.';
    }
    return 'Keep the note under 1,000 characters.';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveSalaryRecord(this.record()?.id ?? null, {
        employmentId: v.employmentId,
        effectiveOn: v.effectiveOn!,
        amount: v.amount!,
        currency: v.currency,
        period: v.period,
        reason: v.reason,
        note: v.note.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (record) => this.activeModal.close({ kind: 'saved', record }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the pay.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this pay record?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeSalaryRecord(record.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the record.')),
    });
  }
}
