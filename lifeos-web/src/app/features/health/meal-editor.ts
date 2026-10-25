import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthService, MEAL_TYPES, Meal, MealType } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { MEAL_TYPE_LABELS } from './health-view';

/** Opens a meal on `day` (new when missing); resolves true when something changed. */
export async function openMealEditor(
  modal: NgbModal,
  day: string,
  meal?: Meal,
  mealType: MealType = 'Lunch',
): Promise<boolean> {
  const modalRef = modal.open(MealEditor, { ariaLabelledBy: 'meal-editor-heading' });
  (modalRef.componentInstance as MealEditor).configure(day, meal, mealType);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

/** What you ate, roughly — the figures are optional and a day's total only adds up the ones given. */
@Component({
  selector: 'app-meal-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="meal-editor-heading" class="modal-title h5">
          {{ meal() ? 'Edit meal' : 'Log a meal' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="btn-group flex-wrap" role="group" aria-label="Meal">
          @for (t of types; track t) {
            <input
              type="radio"
              class="btn-check"
              [id]="'meal-type-' + t"
              formControlName="mealType"
              [value]="t"
            />
            <label class="btn btn-outline-primary" [for]="'meal-type-' + t">{{
              typeLabels[t]
            }}</label>
          }
        </div>
        <div>
          <label class="form-label" for="meal-description">What you ate</label>
          <input
            id="meal-description"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('description')"
            formControlName="description"
            placeholder="e.g. Dal, rice and salad"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('description'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          @for (f of figures; track f.name) {
            <div class="col-6 col-sm-3">
              <label class="form-label" [for]="'meal-' + f.name">{{ f.label }}</label>
              <input
                [id]="'meal-' + f.name"
                type="number"
                min="0"
                [step]="f.step"
                class="form-control"
                [class.is-invalid]="fieldError(f.name)"
                [formControlName]="f.name"
                [placeholder]="f.placeholder"
              />
              @if (fieldError(f.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div>
          <label class="form-label" for="meal-notes"
            >Notes <span class="text-body-secondary small">(encrypted, optional)</span></label
          >
          <textarea
            id="meal-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="How it sat, where you ate"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (meal()) {
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
export class MealEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly types = MEAL_TYPES;
  protected readonly typeLabels = MEAL_TYPE_LABELS;
  protected readonly figures = [
    { name: 'calories', label: 'Calories', step: 1, placeholder: 'e.g. 550' },
    { name: 'proteinG', label: 'Protein (g)', step: 0.1, placeholder: 'e.g. 18' },
    { name: 'carbsG', label: 'Carbs (g)', step: 0.1, placeholder: 'e.g. 70' },
    { name: 'fatG', label: 'Fat (g)', step: 0.1, placeholder: 'e.g. 12' },
  ] as const;
  protected readonly meal = signal<Meal | null>(null);
  protected readonly saving = signal(false);
  private day = todayIso();

  protected readonly form = this.fb.group({
    mealType: this.fb.nonNullable.control<MealType>('Lunch'),
    description: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(500)]),
    calories: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10000)]),
    proteinG: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(9999)]),
    carbsG: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(9999)]),
    fatG: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(9999)]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(day: string, meal: Meal | undefined, mealType: MealType): void {
    this.day = meal?.eatenOn ?? day;
    this.meal.set(meal ?? null);
    this.form.reset({
      mealType: meal?.mealType ?? mealType,
      description: meal?.description ?? '',
      calories: meal?.calories ?? null,
      proteinG: meal?.proteinG ?? null,
      carbsG: meal?.carbsG ?? null,
      fatG: meal?.fatG ?? null,
      notes: meal?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'description' | 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'description':
        return control.errors['required'] ? 'Say what you ate.' : 'That is too long.';
      case 'notes':
        return 'Keep it under 4,000 characters.';
      default:
        return "Can't be negative.";
    }
  }

  protected submit(): void {
    const description = this.form.controls.description;
    description.setValue(description.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.healthService
      .saveMeal(this.meal()?.id ?? null, {
        eatenOn: this.day,
        mealType: v.mealType,
        description: v.description,
        calories: v.calories,
        proteinG: v.proteinG,
        carbsG: v.carbsG,
        fatG: v.fatG,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the meal.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const meal = this.meal();
    if (!meal) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${meal.description}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (confirmed.isConfirmed) {
      this.healthService.removeMeal(meal.id).subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the meal.')),
      });
    }
  }
}
