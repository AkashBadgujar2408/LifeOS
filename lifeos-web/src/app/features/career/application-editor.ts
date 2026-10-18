import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  APPLICATION_STAGES,
  ApplicationStage,
  CareerService,
  JobApplication,
  JobApplicationDetail,
} from '../../core/services/career.service';
import { ContactsService } from '../../core/services/contacts.service';
import { ToastService } from '../../core/services/toast.service';
import { STAGE_LABELS } from './career-view';

/**
 * Opens the application dialog (new when missing — at `stage` when given); resolves with the saved application, or
 * null if dismissed. The stage of an existing one isn't edited here — it moves on the board or its page.
 */
export async function openApplicationEditor(
  modal: NgbModal,
  application?: JobApplication,
  stage?: ApplicationStage,
): Promise<JobApplicationDetail | null> {
  const modalRef = modal.open(ApplicationEditor, {
    ariaLabelledBy: 'application-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as ApplicationEditor).configure(application, stage);
  try {
    return (await modalRef.result) as JobApplicationDetail;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-application-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="application-editor-heading" class="modal-title h5">
          {{ application() ? 'Edit application' : 'New application' }}
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
            <label class="form-label" for="application-role">Role</label>
            <input
              id="application-role"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('role')"
              formControlName="role"
              placeholder="e.g. Staff Engineer"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('role'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="application-organisation">Organisation</label>
            <input
              id="application-organisation"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('organisation')"
              formControlName="organisation"
              placeholder="e.g. Globex"
              autocomplete="off"
            />
            @if (fieldError('organisation'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>

        @if (!application()) {
          <div class="row g-3">
            <div class="col-sm-6">
              <label class="form-label" for="application-stage">Where it stands</label>
              <select id="application-stage" class="form-select" formControlName="stage">
                @for (stage of stages; track stage) {
                  <option [ngValue]="stage" [selected]="stage === form.controls.stage.value">
                    {{ stageLabels[stage] }}
                  </option>
                }
              </select>
            </div>
            <div class="col-sm-6">
              <label class="form-label" for="application-since">Since</label>
              <div class="input-group">
                <input
                  id="application-since"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('stageOn')"
                  formControlName="stageOn"
                  placeholder="e.g. 12/Oct/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #sincePicker="ngbDatepicker"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick the day"
                  (click)="sincePicker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('stageOn'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          </div>
        }

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="application-source">
              Found it through <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="application-source"
              type="text"
              class="form-control"
              formControlName="source"
              placeholder="e.g. LinkedIn, a referral, the careers page"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="application-contact">
              Recruiter or referrer <span class="text-body-secondary small">(optional)</span>
            </label>
            <select id="application-contact" class="form-select" formControlName="contactId">
              <option [ngValue]="null">Nobody in particular</option>
              @for (contact of contacts(); track contact.id) {
                <option
                  [ngValue]="contact.id"
                  [selected]="contact.id === form.controls.contactId.value"
                >
                  {{ contact.name
                  }}{{ contact.organisation ? ' (' + contact.organisation + ')' : '' }}
                </option>
              }
            </select>
          </div>
        </div>
        <div>
          <label class="form-label" for="application-resume">
            Resume sent <span class="text-body-secondary small">(optional)</span>
          </label>
          <select id="application-resume" class="form-select" formControlName="resumeVersionId">
            <option [ngValue]="null">None recorded</option>
            @for (resume of resumes(); track resume.id) {
              <option
                [ngValue]="resume.id"
                [selected]="resume.id === form.controls.resumeVersionId.value"
              >
                {{ resume.name }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="application-url">
            Job posting <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="application-url"
            type="url"
            class="form-control"
            [class.is-invalid]="fieldError('url')"
            formControlName="url"
            placeholder="https://…"
            autocomplete="off"
          />
          @if (fieldError('url'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="application-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="application-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Why it appeals, the salary band, anything you'll want to remember"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class ApplicationEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly stages = APPLICATION_STAGES;
  protected readonly stageLabels = STAGE_LABELS;
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly contacts = toSignal(
    this.contactsService.list().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly resumes = toSignal(
    this.careerService.resumes().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly application = signal<JobApplication | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    role: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    organisation: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    stage: this.fb.nonNullable.control<ApplicationStage>('Saved'),
    stageOn: this.fb.control<string | null>(todayIso(), Validators.required),
    source: this.fb.nonNullable.control('', Validators.maxLength(200)),
    contactId: this.fb.control<number | null>(null),
    resumeVersionId: this.fb.control<number | null>(null),
    url: this.fb.nonNullable.control('', [
      Validators.maxLength(2000),
      Validators.pattern(/^\s*(https?:\/\/\S+)?\s*$/i),
    ]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(application?: JobApplication, stage?: ApplicationStage): void {
    this.application.set(application ?? null);
    this.form.reset({
      role: application?.role ?? '',
      organisation: application?.organisation ?? '',
      stage: stage ?? 'Saved',
      stageOn: todayIso(),
      source: application?.source ?? '',
      contactId: application?.contactId ?? null,
      resumeVersionId: application?.resumeVersionId ?? null,
      url: application?.url ?? '',
      notes: application?.notes ?? '',
    });
    // Where it starts is only asked on create; after that it moves on the board.
    for (const control of [this.form.controls.stage, this.form.controls.stageOn]) {
      if (application) {
        control.disable();
      } else {
        control.enable();
      }
    }
  }

  protected fieldError(name: 'role' | 'organisation' | 'stageOn' | 'url' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'stageOn') {
      return control.errors['required'] ? 'Since when?' : dateFieldError(control.errors);
    }
    if (control.errors['required']) {
      return name === 'role' ? 'Name the role.' : 'Name the organisation.';
    }
    if (control.errors['pattern']) {
      return 'Paste the full web address, starting with https://';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    for (const name of ['role', 'organisation'] as const) {
      const control = this.form.controls[name];
      control.setValue(control.value.trim());
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const existing = this.application();
    this.saving.set(true);
    this.careerService
      .saveApplication(existing?.id ?? null, {
        role: v.role,
        organisation: v.organisation,
        source: v.source.trim() || null,
        url: v.url.trim() || null,
        contactId: v.contactId,
        resumeVersionId: v.resumeVersionId,
        notes: v.notes.trim() || null,
        ...(existing ? {} : { stage: v.stage, stageOn: v.stageOn }),
        today: todayIso(),
      })
      .subscribe({
        next: (application) => this.activeModal.close(application),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the application.'));
        },
      });
  }
}
