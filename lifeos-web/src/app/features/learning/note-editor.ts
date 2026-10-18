import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { KnowledgeNote, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';

export type NoteEditorResult = { kind: 'saved'; note: KnowledgeNote } | { kind: 'deleted' };

/** Opens the note dialog (new when missing); resolves with what happened, or null if dismissed. */
export async function openNoteEditor(
  modal: NgbModal,
  note?: KnowledgeNote,
): Promise<NoteEditorResult | null> {
  const modalRef = modal.open(NoteEditor, { ariaLabelledBy: 'note-editor-heading', size: 'lg' });
  (modalRef.componentInstance as NoteEditor).configure(note);
  try {
    return (await modalRef.result) as NoteEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-note-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="note-editor-heading" class="modal-title h5">
          {{ note() ? 'Edit note' : 'New note' }}
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
          <label class="form-label" for="note-title">Title</label>
          <input
            id="note-title"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('title')"
            formControlName="title"
            placeholder="e.g. Ser vs estar"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('title'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="note-content">
            What to remember <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="note-content"
            class="form-control"
            rows="6"
            [class.is-invalid]="fieldError('content')"
            formControlName="content"
            placeholder="In your own words — that's what makes it stick"
          ></textarea>
          @if (fieldError('content'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3 align-items-end">
          <div class="col-sm-6">
            <label class="form-label" for="note-skill">
              About the skill <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="note-skill" class="form-select" formControlName="skillId">
              <option [ngValue]="null">No particular skill</option>
              @for (skill of skills(); track skill.id) {
                <option [ngValue]="skill.id" [selected]="skill.id === form.controls.skillId.value">
                  {{ skill.name }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <div class="form-check form-switch">
              <input
                id="note-review"
                class="form-check-input"
                type="checkbox"
                role="switch"
                formControlName="review"
                aria-describedby="note-review-help"
              />
              <label class="form-check-label" for="note-review">Review it on a schedule</label>
            </div>
          </div>
        </div>
        <div id="note-review-help" class="form-text mt-0">
          Spaced review: tomorrow, then 3, 7, 14 and 30 days apart while you remember it. Forgetting
          starts the gaps again.
        </div>
      </div>
      <div class="modal-footer">
        @if (note()) {
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
export class NoteEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly skills = toSignal(
    this.learningService.skills().pipe(catchError(() => of([]))),
    {
      initialValue: [],
    },
  );
  protected readonly note = signal<KnowledgeNote | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    content: this.fb.nonNullable.control('', Validators.maxLength(20000)),
    skillId: this.fb.control<number | null>(null),
    review: this.fb.nonNullable.control(true),
  });

  configure(note?: KnowledgeNote): void {
    this.note.set(note ?? null);
    this.form.reset({
      title: note?.title ?? '',
      content: note?.content ?? '',
      skillId: note?.skillId ?? null,
      review: note ? note.nextReviewOn !== null : true,
    });
  }

  protected fieldError(name: 'title' | 'content'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return 'Give the note a title.';
    }
    return name === 'title'
      ? 'Keep the title under 200 characters.'
      : 'Keep the note under 20,000 characters.';
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
    this.learningService
      .saveKnowledgeNote(this.note()?.id ?? null, {
        title: v.title,
        content: v.content.trim() || null,
        skillId: v.skillId,
        review: v.review,
        today: todayIso(),
      })
      .subscribe({
        next: (note) => this.activeModal.close({ kind: 'saved', note }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the note.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const note = this.note();
    if (!note) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${note.title}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeKnowledgeNote(note.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the note.')),
    });
  }
}
