import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  RESUME_VERSION_ENTITY_TYPE,
  ResumeVersion,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';

export type ResumeEditorResult = { kind: 'saved'; resume: ResumeVersion } | { kind: 'deleted' };

/** Opens a resume version's details (new when missing); resolves with what happened, or null if dismissed. */
export async function openResumeEditor(
  modal: NgbModal,
  resume?: ResumeVersion,
): Promise<ResumeEditorResult | null> {
  const modalRef = modal.open(ResumeEditor, { ariaLabelledBy: 'resume-editor-heading' });
  (modalRef.componentInstance as ResumeEditor).configure(resume);
  try {
    return (await modalRef.result) as ResumeEditorResult;
  } catch {
    return null;
  }
}

/** A resume version's name, what it's aimed at, and notes. Its file is added on the Resumes page. */
@Component({
  selector: 'app-resume-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="resume-editor-heading" class="modal-title h5">
          {{ resume() ? 'Edit resume version' : 'New resume version' }}
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
          <label class="form-label" for="resume-name">Name</label>
          <input
            id="resume-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Backend - Oct 2026"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="resume-target">
            Aimed at <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="resume-target"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('targetRole')"
            formControlName="targetRole"
            placeholder="e.g. Staff Engineer roles"
            autocomplete="off"
          />
          @if (fieldError('targetRole'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="resume-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="resume-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="What's different about this one — what it leads with, what it leaves out"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (resume(); as existing) {
          <div class="border-top pt-3">
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="ResumeVersion"
              [entityId]="existing.id"
              [entityTitle]="existing.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (resume()) {
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
export class ResumeEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = RESUME_VERSION_ENTITY_TYPE;
  protected readonly resume = signal<ResumeVersion | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    targetRole: this.fb.nonNullable.control('', Validators.maxLength(200)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(resume?: ResumeVersion): void {
    this.resume.set(resume ?? null);
    this.form.reset({
      name: resume?.name ?? '',
      targetRole: resume?.targetRole ?? '',
      notes: resume?.notes ?? '',
    });
  }

  protected fieldError(name: 'name' | 'targetRole' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return control.errors['required'] ? 'Name this version.' : 'That is too long.';
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveResume(this.resume()?.id ?? null, {
        name: v.name,
        targetRole: v.targetRole.trim() || null,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: (resume) => this.activeModal.close({ kind: 'saved', resume }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the resume version.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const resume = this.resume();
    if (!resume) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${resume.name}"?`,
      text:
        resume.applications.length > 0
          ? 'Its files go too. The applications it was sent with stay, without it.'
          : 'Its files go too.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeResume(resume.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) =>
        this.toast.error(apiErrorMessage(err, 'Could not delete the resume version.')),
    });
  }
}
