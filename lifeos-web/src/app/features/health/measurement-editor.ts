import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  HealthService,
  MEASUREMENT_KINDS,
  Measurement,
  MeasurementKind,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { MEASUREMENTS } from './health-view';

/** Opens a measurement (new of `kind` when missing); resolves true when something changed. */
export async function openMeasurementEditor(
  modal: NgbModal,
  measurement?: Measurement,
  kind: MeasurementKind = 'Weight',
): Promise<boolean> {
  const modalRef = modal.open(MeasurementEditor, { ariaLabelledBy: 'measurement-editor-heading' });
  (modalRef.componentInstance as MeasurementEditor).configure(measurement, kind);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

/** One measurement on a day, in its kind's unit (blood pressure takes two numbers). */
@Component({
  selector: 'app-measurement-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="measurement-editor-heading" class="modal-title h5">
          {{ measurement() ? 'Edit measurement' : 'Add a measurement' }}
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
            <label class="form-label" for="measurement-kind">What</label>
            <select id="measurement-kind" class="form-select" formControlName="kind">
              @for (k of kinds; track k) {
                <option [ngValue]="k" [selected]="k === form.controls.kind.value">
                  {{ info[k].label }} ({{ info[k].unit }})
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="measurement-day">Day</label>
            <div class="input-group">
              <input
                id="measurement-day"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('measuredOn')"
                formControlName="measuredOn"
                placeholder="e.g. 19/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #day="ngbDatepicker"
                [maxDate]="maxDate"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="day.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('measuredOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label" for="measurement-value">
              {{
                form.controls.kind.value === 'BloodPressure'
                  ? 'Systolic (top)'
                  : info[form.controls.kind.value].label
              }}
              <span class="text-body-secondary small"
                >({{ info[form.controls.kind.value].unit }})</span
              >
            </label>
            <input
              id="measurement-value"
              type="number"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('value')"
              formControlName="value"
              [placeholder]="info[form.controls.kind.value].placeholder"
              ngbAutofocus
            />
            @if (fieldError('value'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          @if (form.controls.kind.value === 'BloodPressure') {
            <div class="col-6">
              <label class="form-label" for="measurement-value2">Diastolic (bottom)</label>
              <input
                id="measurement-value2"
                type="number"
                class="form-control"
                [class.is-invalid]="fieldError('value2')"
                formControlName="value2"
                placeholder="e.g. 80"
              />
              @if (fieldError('value2'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div>
          <label class="form-label" for="measurement-notes"
            >Notes <span class="text-body-secondary small">(encrypted, optional)</span></label
          >
          <textarea
            id="measurement-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Morning, after a run, on the clinic's scale"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (measurement()) {
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
export class MeasurementEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = MEASUREMENT_KINDS;
  protected readonly info = MEASUREMENTS;
  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly measurement = signal<Measurement | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<MeasurementKind>('Weight'),
    measuredOn: this.fb.control<string | null>(todayIso(), Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    value2: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(measurement: Measurement | undefined, kind: MeasurementKind): void {
    this.measurement.set(measurement ?? null);
    this.form.reset({
      kind: measurement?.kind ?? kind,
      measuredOn: measurement?.measuredOn ?? todayIso(),
      value: measurement?.value ?? null,
      value2: measurement?.value2 ?? null,
      notes: measurement?.notes ?? '',
    });
  }

  protected fieldError(name: 'measuredOn' | 'value' | 'value2' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'measuredOn':
        return control.errors['required']
          ? 'Pick the day.'
          : control.errors['future']
            ? "Can't be ahead of today."
            : dateFieldError(control.errors);
      case 'value':
        return control.errors['required'] ? 'Enter the reading.' : 'Has to be more than zero.';
      case 'value2':
        return control.errors['required']
          ? 'Blood pressure needs both numbers.'
          : 'The bottom number should be lower than the top one.';
      default:
        return 'Keep it under 4,000 characters.';
    }
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const bp = v.kind === 'BloodPressure';
    if (v.measuredOn && v.measuredOn > todayIso()) {
      this.form.controls.measuredOn.setErrors({ future: true });
    }
    if (bp && v.value2 === null) {
      this.form.controls.value2.setErrors({ required: true });
    } else if (bp && v.value !== null && v.value2 !== null && v.value2 >= v.value) {
      this.form.controls.value2.setErrors({ order: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService
      .saveMeasurement(this.measurement()?.id ?? null, {
        kind: v.kind,
        measuredOn: v.measuredOn!,
        value: v.value!,
        value2: bp ? v.value2 : null,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save it.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const measurement = this.measurement();
    if (!measurement) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this measurement?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (confirmed.isConfirmed) {
      this.healthService.removeMeasurement(measurement.id).subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
      });
    }
  }
}
