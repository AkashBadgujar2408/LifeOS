import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  INTERVIEW_QUESTION_ENTITY_TYPE,
  InterviewQuestion,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';

export type QuestionEditorResult =
  { kind: 'saved'; question: InterviewQuestion } | { kind: 'deleted' };

/**
 * Opens a question of the bank (new when missing — asked in `applicationId` when given); resolves with what
 * happened, or null if dismissed.
 */
export async function openQuestionEditor(
  modal: NgbModal,
  question?: InterviewQuestion,
  applicationId?: number,
): Promise<QuestionEditorResult | null> {
  const modalRef = modal.open(QuestionEditor, {
    ariaLabelledBy: 'question-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as QuestionEditor).configure(question, applicationId);
  try {
    return (await modalRef.result) as QuestionEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-question-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TagPicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="question-editor-heading" class="modal-title h5">
          {{ question() ? 'Interview question' : 'Add a question' }}
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
          <label class="form-label" for="question-text">Question</label>
          <textarea
            id="question-text"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('question')"
            formControlName="question"
            placeholder="e.g. Design a rate limiter for a public API"
            ngbAutofocus
          ></textarea>
          @if (fieldError('question'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="question-answer">
            Your answer <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="question-answer"
            class="form-control"
            rows="6"
            formControlName="answer"
            placeholder="The points you want to hit — for a behavioural one, the situation, what you did, the result"
          ></textarea>
        </div>
        <div>
          <label class="form-label" for="question-review">
            To do better <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="question-review"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('reviewNotes')"
            formControlName="reviewNotes"
            placeholder="What fell flat last time, what to lead with next time"
          ></textarea>
          @if (fieldError('reviewNotes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="question-application">
              Asked in <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="question-application"
              formControlName="applicationId"
              placeholder="A general question"
            >
              @for (a of applications(); track a.id) {
                <ng-option [value]="a.id"> {{ a.role }} at {{ a.organisation }} </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <span class="form-label d-block">Topics</span>
            <app-tag-picker
              [selectedTagIds]="tagIds()"
              (selectedTagIdsChange)="tagIds.set($event)"
            />
          </div>
        </div>

        @if (question(); as existing) {
          <div class="border-top pt-3">
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="InterviewQuestion"
              [entityId]="existing.id"
              [entityTitle]="existing.question"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (question()) {
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
export class QuestionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = INTERVIEW_QUESTION_ENTITY_TYPE;
  protected readonly applications = toSignal(
    this.careerService.applications().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly question = signal<InterviewQuestion | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    question: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(1000)]),
    answer: this.fb.nonNullable.control(''),
    reviewNotes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    applicationId: this.fb.control<number | null>(null),
  });

  configure(question?: InterviewQuestion, applicationId?: number): void {
    this.question.set(question ?? null);
    this.tagIds.set(question?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      question: question?.question ?? '',
      answer: question?.answer ?? '',
      reviewNotes: question?.reviewNotes ?? '',
      applicationId: question ? question.jobApplicationId : (applicationId ?? null),
    });
  }

  protected fieldError(name: 'question' | 'reviewNotes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return control.errors['required'] ? 'Write the question.' : 'That is too long.';
  }

  protected submit(): void {
    const text = this.form.controls.question;
    text.setValue(text.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveQuestion(this.question()?.id ?? null, {
        question: v.question,
        answer: v.answer.trim() || null,
        reviewNotes: v.reviewNotes.trim() || null,
        jobApplicationId: v.applicationId,
        tagIds: this.tagIds(),
      })
      .subscribe({
        next: (question) => this.activeModal.close({ kind: 'saved', question }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the question.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const question = this.question();
    if (!question) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this question?',
      text: question.question,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeQuestion(question.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the question.')),
    });
  }
}
