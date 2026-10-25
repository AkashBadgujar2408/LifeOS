import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { CareerService, PerformanceReview } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';

export type ReviewEditorResult = { kind: 'saved'; review: PerformanceReview } | { kind: 'deleted' };

/** Opens a performance review (new when missing); resolves with what happened, or null if dismissed. */
export async function openReviewEditor(
  modal: NgbModal,
  review?: PerformanceReview,
): Promise<ReviewEditorResult | null> {
  const modalRef = modal.open(ReviewEditor, {
    ariaLabelledBy: 'review-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as ReviewEditor).configure(review);
  try {
    return (await modalRef.result) as ReviewEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-review-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="review-editor-heading" class="modal-title h5">
          {{ review() ? 'Edit review' : 'Add a performance review' }}
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
            <label class="form-label" for="review-on">Reviewed on</label>
            <div class="input-group">
              <input
                id="review-on"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('reviewedOn')"
                formControlName="reviewedOn"
                placeholder="e.g. 15/Apr/2026"
                autocomplete="off"
                ngbDatepicker
                #onPicker="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
                ngbAutofocus
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
            @if (fieldError('reviewedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="review-period">
              Period <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="review-period"
              type="text"
              class="form-control"
              formControlName="periodLabel"
              placeholder="e.g. FY 2025-26, H1 2026"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="review-role">
              Role <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="review-role" class="form-select" formControlName="employmentId">
              <option [ngValue]="null">Not tied to a role</option>
              @for (role of roles(); track role.id) {
                <option
                  [ngValue]="role.id"
                  [selected]="role.id === form.controls.employmentId.value"
                >
                  {{ role.role }} at {{ role.organisation }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="review-rating">
              Rating <span class="text-body-secondary small">(in their words)</span>
            </label>
            <input
              id="review-rating"
              type="text"
              class="form-control"
              formControlName="rating"
              placeholder="e.g. Exceeds expectations, 4 of 5"
              autocomplete="off"
            />
          </div>
        </div>
        <div>
          <label class="form-label" for="review-strengths">What went well</label>
          <textarea
            id="review-strengths"
            class="form-control"
            rows="3"
            formControlName="strengths"
            placeholder="The strengths they called out"
          ></textarea>
        </div>
        <div>
          <label class="form-label" for="review-improvements">To work on</label>
          <textarea
            id="review-improvements"
            class="form-control"
            rows="3"
            formControlName="improvements"
            placeholder="What they'd like to see more of next time"
          ></textarea>
        </div>
        <div>
          <label class="form-label" for="review-notes">
            Your notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="review-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="How you felt about it, what you agreed to do"
          ></textarea>
          @if (contentError()) {
            <div class="invalid-feedback d-block">
              Write down the rating or some of the feedback.
            </div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (review()) {
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
export class ReviewEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly roles = toSignal(
    this.careerService.employments().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly review = signal<PerformanceReview | null>(null);
  protected readonly saving = signal(false);
  protected readonly contentError = signal(false);

  protected readonly form = this.fb.group({
    reviewedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    periodLabel: this.fb.nonNullable.control('', Validators.maxLength(100)),
    employmentId: this.fb.control<number | null>(null),
    rating: this.fb.nonNullable.control('', Validators.maxLength(100)),
    strengths: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    improvements: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(review?: PerformanceReview): void {
    this.review.set(review ?? null);
    this.form.reset({
      reviewedOn: review?.reviewedOn ?? todayIso(),
      periodLabel: review?.periodLabel ?? '',
      employmentId: review?.employmentId ?? null,
      rating: review?.rating ?? '',
      strengths: review?.strengths ?? '',
      improvements: review?.improvements ?? '',
      notes: review?.notes ?? '',
    });
  }

  protected fieldError(name: 'reviewedOn'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return control.errors['required'] ? 'When was it?' : dateFieldError(control.errors);
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const empty = [v.rating, v.strengths, v.improvements, v.notes].every((s) => !s.trim());
    this.contentError.set(empty);
    if (this.form.invalid || empty) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.careerService
      .saveReview(this.review()?.id ?? null, {
        employmentId: v.employmentId,
        reviewedOn: v.reviewedOn!,
        periodLabel: v.periodLabel.trim() || null,
        rating: v.rating.trim() || null,
        strengths: v.strengths.trim() || null,
        improvements: v.improvements.trim() || null,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (review) => this.activeModal.close({ kind: 'saved', review }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the review.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const review = this.review();
    if (!review) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this review?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeReview(review.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the review.')),
    });
  }
}
