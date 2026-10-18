import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  ApplicationStage,
  CareerService,
  JobApplication,
  JobApplicationDetail,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { STAGE_LABELS } from './career-view';
import { resetRound, roundForm, roundPayload, roundScheduleError } from './interview-fields';
import { RoundFields } from './round-fields';

/**
 * Asks when an application moved to `stage` (and why, optionally) and moves it; a move to Interviewing can
 * schedule the first round there and then. Resolves with the updated application, or null if dismissed.
 */
export async function openStageMove(
  modal: NgbModal,
  application: JobApplication,
  stage: ApplicationStage,
): Promise<JobApplicationDetail | null> {
  const modalRef = modal.open(StageMoveDialog, {
    ariaLabelledBy: 'stage-move-heading',
    size: stage === 'Interview' ? 'lg' : undefined,
  });
  (modalRef.componentInstance as StageMoveDialog).configure(application, stage);
  try {
    return (await modalRef.result) as JobApplicationDetail;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-stage-move-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, RoundFields],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="stage-move-heading" class="modal-title h5 text-break">
          {{ application()?.role }} at {{ application()?.organisation }} →
          {{ stageLabels[stage()] }}
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
          <label class="form-label" for="stage-on">When</label>
          <div class="input-group">
            <input
              id="stage-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('on')"
              formControlName="on"
              placeholder="e.g. 18/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #onPicker="ngbDatepicker"
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
          @if (fieldError('on'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="stage-note">
            Note <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="stage-note"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('note')"
            formControlName="note"
            [placeholder]="notePlaceholder()"
            autocomplete="off"
          />
          @if (fieldError('note'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (stage() === 'Interview') {
          <div class="border-top pt-3">
            <div class="form-check form-switch mb-3">
              <input
                id="stage-add-round"
                class="form-check-input"
                type="checkbox"
                role="switch"
                [checked]="addRound()"
                (change)="addRound.set(!addRound())"
              />
              <label class="form-check-label" for="stage-add-round">Add the first round now</label>
            </div>
            @if (addRound()) {
              <app-round-fields [form]="round" [submitted]="submitted()" />
            }
          </div>
        }
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Move it</button>
      </div>
    </form>
  `,
})
export class StageMoveDialog {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly stageLabels = STAGE_LABELS;
  protected readonly application = signal<JobApplication | null>(null);
  protected readonly stage = signal<ApplicationStage>('Applied');
  protected readonly addRound = signal(true);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();

  protected readonly form = this.fb.group({
    on: this.fb.control<string | null>(todayIso(), Validators.required),
    note: this.fb.nonNullable.control('', Validators.maxLength(1000)),
  });
  protected readonly round = roundForm(this.fb);

  configure(application: JobApplication, stage: ApplicationStage): void {
    this.application.set(application);
    this.stage.set(stage);
    this.form.reset({ on: todayIso(), note: '' });
    resetRound(this.round, null, application.interviewCount === 0 ? 'First round' : '');
  }

  protected notePlaceholder(): string {
    switch (this.stage()) {
      case 'Rejected':
        return 'e.g. Went with an internal candidate';
      case 'Withdrawn':
        return 'e.g. Took the other offer';
      case 'Offer':
        return 'e.g. ₹28L base + joining bonus';
      default:
        return 'e.g. Referred by a former colleague';
    }
  }

  protected fieldError(name: 'on' | 'note'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'on') {
      return control.errors['required'] ? 'When did it happen?' : dateFieldError(control.errors);
    }
    return 'That is too long.';
  }

  protected submit(): void {
    this.submitted.set(true);
    const withRound = this.stage() === 'Interview' && this.addRound();
    if (withRound) {
      this.round.controls.title.setValue(this.round.controls.title.value.trim());
    }
    if (
      this.form.invalid ||
      (withRound && (this.round.invalid || roundScheduleError(this.round)))
    ) {
      this.form.markAllAsTouched();
      this.round.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .moveApplication(this.application()!.id, {
        stage: this.stage(),
        on: v.on!,
        note: v.note.trim() || null,
        interview: withRound
          ? { ...roundPayload(this.round), reviewNotes: null, outcome: null }
          : null,
        today: todayIso(),
      })
      .subscribe({
        next: (application) => this.activeModal.close(application),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not move the application.'));
        },
      });
  }
}
