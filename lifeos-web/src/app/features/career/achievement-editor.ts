import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  ACHIEVEMENT_KINDS,
  CAREER_ACHIEVEMENT_ENTITY_TYPE,
  CareerAchievement,
  CareerAchievementKind,
  CareerService,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { ACHIEVEMENT_KIND_LABELS } from './career-view';

export type AchievementEditorResult =
  { kind: 'saved'; achievement: CareerAchievement } | { kind: 'deleted' };

/**
 * Opens the achievement dialog (new when missing — for `employmentId` when given); resolves with what happened, or
 * null if dismissed.
 */
export async function openAchievementEditor(
  modal: NgbModal,
  achievement?: CareerAchievement,
  employmentId?: number,
): Promise<AchievementEditorResult | null> {
  const modalRef = modal.open(AchievementEditor, {
    ariaLabelledBy: 'achievement-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as AchievementEditor).configure(achievement, employmentId);
  try {
    return (await modalRef.result) as AchievementEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-achievement-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="achievement-editor-heading" class="modal-title h5">
          {{ achievement() ? 'Edit achievement' : 'Add an achievement' }}
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
          <label class="form-label" for="achievement-title">What you achieved</label>
          <input
            id="achievement-title"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('title')"
            formControlName="title"
            placeholder="e.g. Shipped the payments rewrite"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('title'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="achievement-kind">Kind</label>
            <select id="achievement-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-8">
            <label class="form-label" for="achievement-on">When</label>
            <div class="input-group">
              <input
                id="achievement-on"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('achievedOn')"
                formControlName="achievedOn"
                placeholder="e.g. 15/Feb/2024"
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
            @if (fieldError('achievedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="achievement-role">
            In the role <span class="text-body-secondary small">(optional)</span>
          </label>
          <select id="achievement-role" class="form-select" formControlName="employmentId">
            <option [ngValue]="null">Outside a role</option>
            @for (role of roles(); track role.id) {
              <option [ngValue]="role.id" [selected]="role.id === form.controls.employmentId.value">
                {{ role.role }} at {{ role.organisation }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="achievement-description">
            The impact <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="achievement-description"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('description')"
            formControlName="description"
            placeholder="What changed because of it — the line you'd put on a resume"
          ></textarea>
          @if (fieldError('description'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        @if (achievement(); as existing) {
          <div class="border-top pt-3">
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="CareerAchievement"
              [entityId]="existing.id"
              [entityTitle]="existing.title"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (achievement()) {
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
export class AchievementEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = CAREER_ACHIEVEMENT_ENTITY_TYPE;
  protected readonly kinds = ACHIEVEMENT_KINDS;
  protected readonly kindLabels = ACHIEVEMENT_KIND_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly roles = toSignal(
    this.careerService.employments().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly achievement = signal<CareerAchievement | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<CareerAchievementKind>('Project'),
    achievedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    employmentId: this.fb.control<number | null>(null),
    description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(achievement?: CareerAchievement, employmentId?: number): void {
    this.achievement.set(achievement ?? null);
    this.form.reset({
      title: achievement?.title ?? '',
      kind: achievement?.kind ?? 'Project',
      achievedOn: achievement?.achievedOn ?? todayIso(),
      employmentId: achievement ? achievement.employmentId : (employmentId ?? null),
      description: achievement?.description ?? '',
    });
  }

  protected fieldError(name: 'title' | 'achievedOn' | 'description'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'achievedOn') {
      return control.errors['required'] ? 'When was it?' : dateFieldError(control.errors);
    }
    if (control.errors['required']) {
      return 'Say what you achieved.';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveAchievement(this.achievement()?.id ?? null, {
        employmentId: v.employmentId,
        kind: v.kind,
        title: v.title,
        achievedOn: v.achievedOn!,
        description: v.description.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (achievement) => this.activeModal.close({ kind: 'saved', achievement }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the achievement.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const achievement = this.achievement();
    if (!achievement) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${achievement.title}"?`,
      text: 'It leaves your story too.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeAchievement(achievement.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the achievement.')),
    });
  }
}
