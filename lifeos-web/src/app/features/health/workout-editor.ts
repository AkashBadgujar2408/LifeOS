import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  HealthService,
  INTENSITIES,
  Intensity,
  WORKOUT_KINDS,
  Workout,
  WorkoutKind,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { INTENSITY_LABELS, WORKOUT_KIND_LABELS } from './health-view';

/** Opens a workout (new when missing); resolves true when something changed. */
export async function openWorkoutEditor(modal: NgbModal, workout?: Workout): Promise<boolean> {
  const modalRef = modal.open(WorkoutEditor, { ariaLabelledBy: 'workout-editor-heading' });
  (modalRef.componentInstance as WorkoutEditor).configure(workout);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

/** A walk, a run, a gym session: what, when, how long, and (if you track them) steps, distance and calories. */
@Component({
  selector: 'app-workout-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="workout-editor-heading" class="modal-title h5">
          {{ workout() ? 'Edit exercise' : 'Log exercise' }}
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
            <label class="form-label" for="workout-kind">What</label>
            <select id="workout-kind" class="form-select" formControlName="kind" ngbAutofocus>
              @for (k of kinds; track k) {
                <option [ngValue]="k" [selected]="k === form.controls.kind.value">
                  {{ kindLabels[k] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="workout-day">Day</label>
            <div class="input-group">
              <input
                id="workout-day"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('occurredOn')"
                formControlName="occurredOn"
                placeholder="e.g. 19/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #day="ngbDatepicker"
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
            @if (fieldError('occurredOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-6 col-sm-3">
            <label class="form-label" for="workout-minutes">Minutes</label>
            <input
              id="workout-minutes"
              type="number"
              min="1"
              class="form-control"
              [class.is-invalid]="fieldError('minutes')"
              formControlName="minutes"
              placeholder="e.g. 30"
            />
            @if (fieldError('minutes'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="workout-steps">Steps</label>
            <input
              id="workout-steps"
              type="number"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('steps')"
              formControlName="steps"
              placeholder="e.g. 4500"
            />
            @if (fieldError('steps'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="workout-distance">Km</label>
            <input
              id="workout-distance"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('distanceKm')"
              formControlName="distanceKm"
              placeholder="e.g. 5.2"
            />
            @if (fieldError('distanceKm'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="workout-calories">Calories</label>
            <input
              id="workout-calories"
              type="number"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('calories')"
              formControlName="calories"
              placeholder="e.g. 250"
            />
            @if (fieldError('calories'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="workout-intensity">How hard</label>
          <select id="workout-intensity" class="form-select" formControlName="intensity">
            <option [ngValue]="null" [selected]="form.controls.intensity.value === null">
              Not saying
            </option>
            @for (i of intensities; track i) {
              <option [ngValue]="i" [selected]="i === form.controls.intensity.value">
                {{ intensityLabels[i] }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="workout-notes"
            >Notes <span class="text-body-secondary small">(encrypted, optional)</span></label
          >
          <textarea
            id="workout-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Route, sets, how it felt"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (workout()) {
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
export class WorkoutEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = WORKOUT_KINDS;
  protected readonly kindLabels = WORKOUT_KIND_LABELS;
  protected readonly intensities = INTENSITIES;
  protected readonly intensityLabels = INTENSITY_LABELS;
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly workout = signal<Workout | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<WorkoutKind>('Walk'),
    occurredOn: this.fb.control<string | null>(todayIso(), Validators.required),
    minutes: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(1440),
    ]),
    steps: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(200000)]),
    distanceKm: this.fb.control<number | null>(null, [Validators.min(0.01), Validators.max(9999)]),
    calories: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(20000)]),
    intensity: this.fb.control<Intensity | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(workout?: Workout): void {
    this.workout.set(workout ?? null);
    this.form.reset({
      kind: workout?.kind ?? 'Walk',
      occurredOn: workout?.occurredOn ?? todayIso(),
      minutes: workout?.minutes ?? null,
      steps: workout?.steps ?? null,
      distanceKm: workout?.distanceKm ?? null,
      calories: workout?.calories ?? null,
      intensity: workout?.intensity ?? null,
      notes: workout?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'occurredOn' | 'minutes' | 'steps' | 'distanceKm' | 'calories' | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'occurredOn':
        return control.errors['required']
          ? 'Pick the day.'
          : control.errors['future']
            ? "Can't be ahead of today."
            : dateFieldError(control.errors);
      case 'minutes':
        return control.errors['required'] ? 'How long was it?' : '1 to 1,440 minutes.';
      case 'steps':
        return '0 to 200,000.';
      case 'distanceKm':
        return 'More than zero — or leave it blank.';
      case 'calories':
        return '0 to 20,000.';
      default:
        return 'Keep it under 4,000 characters.';
    }
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    if (v.occurredOn && v.occurredOn > todayIso()) {
      this.form.controls.occurredOn.setErrors({ future: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService
      .saveWorkout(this.workout()?.id ?? null, {
        kind: v.kind,
        occurredOn: v.occurredOn!,
        minutes: v.minutes!,
        steps: v.steps,
        distanceKm: v.distanceKm,
        calories: v.calories,
        intensity: v.intensity,
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
    const workout = this.workout();
    if (!workout) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this exercise?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (confirmed.isConfirmed) {
      this.healthService.removeWorkout(workout.id).subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
      });
    }
  }
}
