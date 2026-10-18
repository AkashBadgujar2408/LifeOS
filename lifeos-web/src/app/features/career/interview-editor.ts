import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  INTERVIEW_OUTCOMES,
  Interview,
  InterviewOutcome,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { resetRound, roundForm, roundPayload, roundScheduleError } from './interview-fields';
import { RoundFields } from './round-fields';

export type InterviewEditorResult = { kind: 'saved'; interview: Interview } | { kind: 'deleted' };

/** Opens a round of the application (new when `interview` is missing); resolves with what happened, or null. */
export async function openInterviewEditor(
  modal: NgbModal,
  applicationId: number,
  interview?: Interview,
): Promise<InterviewEditorResult | null> {
  const modalRef = modal.open(InterviewEditor, {
    ariaLabelledBy: 'interview-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as InterviewEditor).configure(applicationId, interview);
  try {
    return (await modalRef.result) as InterviewEditorResult;
  } catch {
    return null;
  }
}

/** One interview round: when and where (on the calendar), how to prepare, and afterwards how it went. */
@Component({
  selector: 'app-interview-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RoundFields],
  template: `
    <form [formGroup]="round" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="interview-editor-heading" class="modal-title h5">
          {{ interview() ? 'Interview round' : 'Add a round' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <app-round-fields [form]="round" [submitted]="submitted()" />
        <div [formGroup]="after" class="border-top pt-3 d-flex flex-column gap-3">
          <div>
            <label class="form-label" for="interview-outcome">How it went</label>
            <select id="interview-outcome" class="form-select" formControlName="outcome">
              <option [ngValue]="null">Not known yet</option>
              @for (outcome of outcomes; track outcome) {
                <option [ngValue]="outcome" [selected]="outcome === after.controls.outcome.value">
                  {{ outcome === 'Passed' ? 'Went through' : "Didn't go through" }}
                </option>
              }
            </select>
          </div>
          <div>
            <label class="form-label" for="interview-review">
              Looking back <span class="text-body-secondary small">(optional)</span>
            </label>
            <textarea
              id="interview-review"
              class="form-control"
              rows="3"
              formControlName="reviewNotes"
              placeholder="What they asked, what went well, what to do differently next time"
            ></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        @if (interview()) {
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
export class InterviewEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly outcomes = INTERVIEW_OUTCOMES;
  protected readonly interview = signal<Interview | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  private applicationId = 0;

  protected readonly round = roundForm(this.fb);
  protected readonly after = this.fb.group({
    outcome: this.fb.control<InterviewOutcome | null>(null),
    reviewNotes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(applicationId: number, interview?: Interview): void {
    this.applicationId = applicationId;
    this.interview.set(interview ?? null);
    resetRound(this.round, interview);
    this.after.reset({
      outcome: interview?.outcome ?? null,
      reviewNotes: interview?.reviewNotes ?? '',
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    const title = this.round.controls.title;
    title.setValue(title.value.trim());
    if (this.round.invalid || this.after.invalid || roundScheduleError(this.round)) {
      this.round.markAllAsTouched();
      return;
    }
    const after = this.after.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveInterview(this.interview()?.id ?? null, this.applicationId, {
        ...roundPayload(this.round),
        outcome: after.outcome,
        reviewNotes: after.reviewNotes.trim() || null,
      })
      .subscribe({
        next: (interview) => this.activeModal.close({ kind: 'saved', interview }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the round.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const interview = this.interview();
    if (!interview) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${interview.title}"?`,
      text: interview.eventId ? 'Its calendar entry goes too.' : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeInterview(interview.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the round.')),
    });
  }
}
