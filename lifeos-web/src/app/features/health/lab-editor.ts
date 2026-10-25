import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthService, LabResult } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';

/** Opens a lab result (new when missing, optionally for a test already known); resolves true when something changed. */
export async function openLabEditor(
  modal: NgbModal,
  result?: LabResult,
  test?: {
    testName: string;
    unit: string | null;
    rangeLow: number | null;
    rangeHigh: number | null;
  },
): Promise<boolean> {
  const modalRef = modal.open(LabEditor, { ariaLabelledBy: 'lab-editor-heading', size: 'lg' });
  (modalRef.componentInstance as LabEditor).configure(result, test);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

/**
 * One result from a lab report: the test, a number (with the lab's range, either end open) or a word, where and when.
 * Once saved, the report itself is linked from Documents (in the vault).
 */
@Component({
  selector: 'app-lab-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="lab-editor-heading" class="modal-title h5">
          {{ result() ? 'Edit result' : 'Add a lab result' }}
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
          <div class="col-sm-7">
            <label class="form-label" for="lab-test">Test</label>
            <input
              id="lab-test"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('testName')"
              formControlName="testName"
              placeholder="e.g. HbA1c"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('testName'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="lab-day">Taken on</label>
            <div class="input-group">
              <input
                id="lab-day"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('takenOn')"
                formControlName="takenOn"
                placeholder="e.g. 10/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #day="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
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
            @if (fieldError('takenOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="btn-group" role="group" aria-label="Kind of result">
          <input
            type="radio"
            class="btn-check"
            id="lab-numeric"
            formControlName="numeric"
            [value]="true"
          />
          <label class="btn btn-outline-primary" for="lab-numeric">A number</label>
          <input
            type="radio"
            class="btn-check"
            id="lab-word"
            formControlName="numeric"
            [value]="false"
          />
          <label class="btn btn-outline-primary" for="lab-word">A word</label>
        </div>
        @if (form.controls.numeric.value) {
          <div class="row g-3">
            <div class="col-6 col-sm-3">
              <label class="form-label" for="lab-value">Result</label>
              <input
                id="lab-value"
                type="number"
                step="any"
                class="form-control"
                [class.is-invalid]="fieldError('value')"
                formControlName="value"
                placeholder="e.g. 5.9"
              />
              @if (fieldError('value'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div class="col-6 col-sm-3">
              <label class="form-label" for="lab-unit">Unit</label>
              <input
                id="lab-unit"
                type="text"
                class="form-control"
                formControlName="unit"
                placeholder="e.g. %"
                autocomplete="off"
              />
            </div>
            <div class="col-6 col-sm-3">
              <label class="form-label" for="lab-low">Range from</label>
              <input
                id="lab-low"
                type="number"
                step="any"
                class="form-control"
                formControlName="rangeLow"
                placeholder="e.g. 4.0"
              />
            </div>
            <div class="col-6 col-sm-3">
              <label class="form-label" for="lab-high">to</label>
              <input
                id="lab-high"
                type="number"
                step="any"
                class="form-control"
                [class.is-invalid]="fieldError('rangeHigh')"
                formControlName="rangeHigh"
                placeholder="e.g. 5.6"
              />
              @if (fieldError('rangeHigh'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          </div>
          <div class="form-text mt-0">
            Leave an end of the range blank when the report says "below …" or "above …".
          </div>
        } @else {
          <div>
            <label class="form-label" for="lab-text">Result</label>
            <input
              id="lab-text"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('valueText')"
              formControlName="valueText"
              placeholder="e.g. Negative"
              autocomplete="off"
            />
            @if (fieldError('valueText'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="lab-lab">Laboratory</label>
            <input
              id="lab-lab"
              type="text"
              class="form-control"
              formControlName="laboratory"
              placeholder="e.g. City Labs"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="lab-visit">Ordered at</label>
            <ng-select
              labelForId="lab-visit"
              formControlName="visitId"
              placeholder="Pick a visit (optional)"
            >
              @for (v of visits(); track v.id) {
                <ng-option [value]="v.id"> {{ v.reason }} ({{ v.visitOn | date }}) </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div>
          <label class="form-label" for="lab-notes"
            >Notes <span class="text-body-secondary small">(encrypted, optional)</span></label
          >
          <textarea
            id="lab-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Fasting, what the doctor said about it"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (result(); as r) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the report from Documents (keep it in the vault).
            </p>
            <app-linked-items
              entityType="LabResult"
              [entityId]="r.id"
              preferredLinkType="Document"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (result()) {
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
export class LabEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly visits = toSignal(this.healthService.visits().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly result = signal<LabResult | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    testName: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    takenOn: this.fb.control<string | null>(todayIso(), Validators.required),
    numeric: this.fb.nonNullable.control(true),
    value: this.fb.control<number | null>(null),
    valueText: this.fb.nonNullable.control('', Validators.maxLength(100)),
    unit: this.fb.nonNullable.control('', Validators.maxLength(30)),
    rangeLow: this.fb.control<number | null>(null),
    rangeHigh: this.fb.control<number | null>(null),
    laboratory: this.fb.nonNullable.control('', Validators.maxLength(200)),
    visitId: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(
    result: LabResult | undefined,
    test?: {
      testName: string;
      unit: string | null;
      rangeLow: number | null;
      rangeHigh: number | null;
    },
  ): void {
    this.result.set(result ?? null);
    this.form.reset({
      testName: result?.testName ?? test?.testName ?? '',
      takenOn: result?.takenOn ?? todayIso(),
      numeric: result ? result.value !== null : true,
      value: result?.value ?? null,
      valueText: result?.valueText ?? '',
      unit: result?.unit ?? test?.unit ?? '',
      rangeLow: result?.rangeLow ?? test?.rangeLow ?? null,
      rangeHigh: result?.rangeHigh ?? test?.rangeHigh ?? null,
      laboratory: result?.laboratory ?? '',
      visitId: result?.visitId ?? null,
      notes: result?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'testName' | 'takenOn' | 'value' | 'valueText' | 'rangeHigh' | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'testName':
        return control.errors['required']
          ? 'Name the test (as on the report).'
          : 'That is too long.';
      case 'takenOn':
        return control.errors['required']
          ? 'Pick the day.'
          : control.errors['future']
            ? "Can't be ahead of today."
            : dateFieldError(control.errors);
      case 'value':
      case 'valueText':
        return 'Give the result.';
      case 'rangeHigh':
        return "The range can't end below where it starts.";
      default:
        return 'Keep it under 4,000 characters.';
    }
  }

  protected submit(): void {
    const name = this.form.controls.testName;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    if (v.takenOn && v.takenOn > todayIso()) {
      this.form.controls.takenOn.setErrors({ future: true });
    }
    if (v.numeric && v.value === null) {
      this.form.controls.value.setErrors({ required: true });
    }
    if (!v.numeric && !v.valueText.trim()) {
      this.form.controls.valueText.setErrors({ required: true });
    }
    if (v.numeric && v.rangeLow !== null && v.rangeHigh !== null && v.rangeLow > v.rangeHigh) {
      this.form.controls.rangeHigh.setErrors({ order: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService
      .saveLabResult(this.result()?.id ?? null, {
        testName: v.testName,
        takenOn: v.takenOn!,
        value: v.numeric ? v.value : null,
        valueText: v.numeric ? null : v.valueText.trim(),
        unit: v.numeric ? v.unit.trim() || null : null,
        rangeLow: v.numeric ? v.rangeLow : null,
        rangeHigh: v.numeric ? v.rangeHigh : null,
        laboratory: v.laboratory.trim() || null,
        visitId: v.visitId,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the result.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const result = this.result();
    if (!result) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete this ${result.testName} result?`,
      text: 'A linked report stays in Documents.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (confirmed.isConfirmed) {
      this.healthService.removeLabResult(result.id).subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the result.')),
      });
    }
  }
}
