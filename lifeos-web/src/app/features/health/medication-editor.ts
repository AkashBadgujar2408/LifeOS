import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  NgbActiveModal,
  NgbInputDatepicker,
  NgbModal,
  NgbTimepicker,
  NgbTimeStruct,
} from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { WEEKDAY_NAMES, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthService, Medication } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { EVERY_DAY } from '../habits/habit-schedule';

export type MedicationEditorResult =
  { kind: 'saved'; medication: Medication } | { kind: 'deleted' };

/** Opens a medicine (new when missing); resolves with what happened, or null if dismissed. */
export async function openMedicationEditor(
  modal: NgbModal,
  medication?: Medication,
): Promise<MedicationEditorResult | null> {
  const modalRef = modal.open(MedicationEditor, {
    ariaLabelledBy: 'medication-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as MedicationEditor).configure(medication);
  try {
    return (await modalRef.result) as MedicationEditorResult;
  } catch {
    return null;
  }
}

type ScheduleForm = FormGroup<{
  time: FormControl<NgbTimeStruct | null>;
  days: FormControl<number>;
  dose: FormControl<string>;
}>;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A medicine: what and how strong, from when to when, and either the times it's taken (each on chosen weekdays,
 * ticked like habit days) or "when needed". Saving replaces the times as a whole — a time that stays keeps its
 * ticks.
 */
@Component({
  selector: 'app-medication-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    NgbTimepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="medication-editor-heading" class="modal-title h5">
          {{ medication() ? 'Edit medicine' : 'Add a medicine' }}
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
            <label class="form-label" for="medication-name">Medicine</label>
            <input
              id="medication-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Metformin"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="medication-strength">Strength</label>
            <input
              id="medication-strength"
              type="text"
              class="form-control"
              formControlName="strength"
              placeholder="e.g. 500 mg"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-6">
              <label class="form-label" [for]="'medication-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'medication-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
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
        <div>
          <div class="form-check form-switch">
            <input
              id="medication-as-needed"
              type="checkbox"
              class="form-check-input"
              role="switch"
              formControlName="isAsNeeded"
            />
            <label class="form-check-label" for="medication-as-needed"
              >Taken only when needed</label
            >
          </div>
        </div>
        @if (!form.controls.isAsNeeded.value) {
          <fieldset>
            <legend class="form-label fs-6 mb-2">When it's taken</legend>
            <div class="d-flex flex-column gap-3" formArrayName="schedules">
              @for (row of schedules.controls; track row; let i = $index) {
                <div
                  class="border rounded p-2 d-flex flex-wrap align-items-end gap-3"
                  [formGroupName]="i"
                >
                  <div>
                    <span class="form-label small d-block" [id]="'schedule-time-' + i">Time</span>
                    <ngb-timepicker
                      formControlName="time"
                      [spinners]="false"
                      [minuteStep]="5"
                      [meridian]="true"
                      [attr.aria-labelledby]="'schedule-time-' + i"
                    />
                  </div>
                  <div>
                    <span class="form-label small d-block">Days</span>
                    <div
                      class="btn-group btn-group-sm flex-wrap"
                      role="group"
                      [attr.aria-label]="'Days for time ' + (i + 1)"
                    >
                      @for (name of weekdays; track name; let d = $index) {
                        <button
                          type="button"
                          class="btn"
                          [class.btn-primary]="hasDay(row, d)"
                          [class.btn-outline-secondary]="!hasDay(row, d)"
                          [attr.aria-pressed]="hasDay(row, d)"
                          (click)="toggleDay(row, d)"
                        >
                          {{ name }}
                        </button>
                      }
                    </div>
                  </div>
                  <div class="flex-grow-1" style="min-width: 8rem">
                    <label class="form-label small" [for]="'schedule-dose-' + i">Dose</label>
                    <input
                      [id]="'schedule-dose-' + i"
                      type="text"
                      class="form-control form-control-sm"
                      formControlName="dose"
                      placeholder="e.g. 1 tablet"
                      autocomplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    [attr.aria-label]="'Remove time ' + (i + 1)"
                    (click)="removeSchedule(i)"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              }
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-primary mt-2"
              (click)="addSchedule()"
            >
              <i class="bi bi-plus-lg"></i> Add a time
            </button>
            @if (scheduleError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </fieldset>
        }
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="medication-condition">For</label>
            <ng-select
              labelForId="medication-condition"
              formControlName="conditionId"
              placeholder="Not linked to your history"
            >
              @for (c of conditions(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="medication-visit">Prescribed at</label>
            <ng-select
              labelForId="medication-visit"
              formControlName="prescribedAtVisitId"
              placeholder="—"
            >
              @for (v of visits(); track v.id) {
                <ng-option [value]="v.id"> {{ v.reason }} ({{ v.visitOn | date }}) </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div>
          <label class="form-label" for="medication-notes">
            Notes <span class="text-body-secondary small">(encrypted, optional)</span>
          </label>
          <textarea
            id="medication-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="With food, side effects to watch for"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (medication(); as m) {
          <div class="border-top pt-3">
            <app-linked-items
              entityType="Medication"
              [entityId]="m.id"
              preferredLinkType="Document"
            />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Medication"
              [entityId]="m.id"
              [entityTitle]="m.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (medication()) {
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
export class MedicationEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly weekdays = WEEKDAY_NAMES;
  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 5, month: 12, day: 31 };
  protected readonly dateFields = [
    { name: 'startDate', label: 'Started', placeholder: 'e.g. 15/Oct/2026' },
    { name: 'endDate', label: 'Stops', placeholder: 'Leave blank if ongoing' },
  ] as const;
  protected readonly conditions = toSignal(
    this.healthService.conditions().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly visits = toSignal(this.healthService.visits().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly medication = signal<Medication | null>(null);
  protected readonly saving = signal(false);
  protected readonly scheduleError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    strength: this.fb.nonNullable.control('', Validators.maxLength(100)),
    startDate: this.fb.control<string | null>(todayIso(), Validators.required),
    endDate: this.fb.control<string | null>(null),
    isAsNeeded: this.fb.nonNullable.control(false),
    schedules: this.fb.array<ScheduleForm>([]),
    conditionId: this.fb.control<number | null>(null),
    prescribedAtVisitId: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  protected get schedules(): FormArray<ScheduleForm> {
    return this.form.controls.schedules;
  }

  configure(medication?: Medication): void {
    this.medication.set(medication ?? null);
    this.schedules.clear();
    for (const s of medication?.schedules ?? []) {
      const [hour, minute] = s.timeOfDay.split(':').map(Number);
      this.schedules.push(
        this.scheduleRow({ hour, minute, second: 0 }, s.scheduleDays, s.dose ?? ''),
      );
    }
    if (!medication) {
      this.schedules.push(this.scheduleRow({ hour: 8, minute: 0, second: 0 }, EVERY_DAY, ''));
    }
    this.form.patchValue({
      name: medication?.name ?? '',
      strength: medication?.strength ?? '',
      startDate: medication?.startDate ?? todayIso(),
      endDate: medication?.endDate ?? null,
      isAsNeeded: medication?.isAsNeeded ?? false,
      conditionId: medication?.conditionId ?? null,
      prescribedAtVisitId: medication?.prescribedAtVisitId ?? null,
      notes: medication?.notes ?? '',
    });
    this.form.markAsUntouched();
  }

  protected hasDay(row: ScheduleForm, index: number): boolean {
    return (row.controls.days.value & (1 << index)) !== 0;
  }

  protected toggleDay(row: ScheduleForm, index: number): void {
    row.controls.days.setValue(row.controls.days.value ^ (1 << index));
  }

  protected addSchedule(): void {
    const last = this.schedules.at(this.schedules.length - 1)?.controls.time.value;
    const hour = last ? Math.min(last.hour + 12, 23) : 8;
    this.schedules.push(
      this.scheduleRow({ hour, minute: last?.minute ?? 0, second: 0 }, EVERY_DAY, ''),
    );
  }

  protected removeSchedule(index: number): void {
    this.schedules.removeAt(index);
  }

  protected fieldError(name: 'name' | 'startDate' | 'endDate' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name the medicine.' : 'That is too long.';
      case 'startDate':
        return control.errors['required']
          ? 'When did you start it?'
          : dateFieldError(control.errors);
      case 'endDate':
        return control.errors['beforeStart']
          ? "It can't stop before it starts."
          : dateFieldError(control.errors);
      default:
        return 'Keep it under 4,000 characters.';
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    if (v.endDate && v.startDate && v.endDate < v.startDate) {
      this.form.controls.endDate.setErrors({ beforeStart: true });
    }
    const times = v.isAsNeeded ? [] : v.schedules;
    let scheduleError: string | null = null;
    if (!v.isAsNeeded) {
      const keys = times.map((s) => (s.time ? `${pad(s.time.hour)}:${pad(s.time.minute)}` : ''));
      scheduleError =
        times.length === 0
          ? 'Add the times it\'s taken, or switch on "Taken only when needed".'
          : keys.some((k) => !k)
            ? 'Give each time.'
            : new Set(keys).size !== keys.length
              ? 'The same time is in twice.'
              : times.some((s) => s.days === 0)
                ? 'Pick at least one day for each time.'
                : null;
    }
    this.scheduleError.set(scheduleError);
    if (this.form.invalid || scheduleError) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService
      .saveMedication(
        this.medication()?.id ?? null,
        {
          name: v.name,
          strength: v.strength.trim() || null,
          startDate: v.startDate!,
          endDate: v.endDate,
          isAsNeeded: v.isAsNeeded,
          conditionId: v.conditionId,
          prescribedAtVisitId: v.prescribedAtVisitId,
          notes: v.notes.trim() || null,
          schedules: times.map((s) => ({
            timeOfDay: `${pad(s.time!.hour)}:${pad(s.time!.minute)}`,
            scheduleDays: s.days,
            dose: s.dose.trim() || null,
          })),
        },
        todayIso(),
      )
      .subscribe({
        next: (medication) => this.activeModal.close({ kind: 'saved', medication }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the medicine.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const medication = this.medication();
    if (!medication) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${medication.name}"?`,
      text: 'Its schedule and every dose ticked go too. To keep the history, set the day it stops instead.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.healthService.removeMedication(medication.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the medicine.')),
    });
  }

  private scheduleRow(time: NgbTimeStruct, days: number, dose: string): ScheduleForm {
    return this.fb.group({
      time: this.fb.control<NgbTimeStruct | null>(time),
      days: this.fb.nonNullable.control(days),
      dose: this.fb.nonNullable.control(dose, Validators.maxLength(100)),
    });
  }
}
