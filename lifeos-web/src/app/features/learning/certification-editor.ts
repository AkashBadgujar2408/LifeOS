import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CERTIFICATION_ENTITY_TYPE,
  Certification,
  LearningService,
} from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { RENEWAL_REMINDER_OPTIONS } from './learning-plan-view';

export type CertificationEditorResult =
  { kind: 'saved'; certification: Certification } | { kind: 'deleted' };

/** Opens the certification dialog (new when missing); resolves with what happened, or null if dismissed. */
export async function openCertificationEditor(
  modal: NgbModal,
  certification?: Certification,
): Promise<CertificationEditorResult | null> {
  const modalRef = modal.open(CertificationEditor, {
    ariaLabelledBy: 'certification-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as CertificationEditor).configure(certification);
  try {
    return (await modalRef.result) as CertificationEditorResult;
  } catch {
    return null;
  }
}

// Mirrors CK_Certifications_Dates and CK_Certifications_Reminder.
function certificationRules(group: AbstractControl): ValidationErrors | null {
  const { issuedOn, expiresOn } = group.value as {
    issuedOn: string | null;
    expiresOn: string | null;
  };
  return issuedOn && expiresOn && expiresOn < issuedOn ? { expiresBeforeIssued: true } : null;
}

@Component({
  selector: 'app-certification-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './certification-editor.html',
})
export class CertificationEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = CERTIFICATION_ENTITY_TYPE;
  protected readonly reminderOptions = RENEWAL_REMINDER_OPTIONS;
  protected readonly minDate = { year: 1980, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly skills = toSignal(
    this.learningService.skills().pipe(catchError(() => of([]))),
    {
      initialValue: [],
    },
  );
  protected readonly courses = toSignal(
    this.learningService.courses().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly certification = signal<Certification | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      issuer: this.fb.nonNullable.control('', Validators.maxLength(200)),
      credentialId: this.fb.nonNullable.control('', Validators.maxLength(100)),
      url: this.fb.nonNullable.control('', Validators.maxLength(500)),
      issuedOn: this.fb.control<string | null>(null, Validators.required),
      expiresOn: this.fb.control<string | null>(null),
      renewalReminderDays: this.fb.control<number | null>(60),
      skillId: this.fb.control<number | null>(null),
      courseId: this.fb.control<number | null>(null),
    },
    { validators: certificationRules },
  );

  configure(certification?: Certification): void {
    this.certification.set(certification ?? null);
    this.form.reset({
      name: certification?.name ?? '',
      issuer: certification?.issuer ?? '',
      credentialId: certification?.credentialId ?? '',
      url: certification?.url ?? '',
      issuedOn: certification?.issuedOn ?? null,
      expiresOn: certification?.expiresOn ?? null,
      renewalReminderDays: certification ? certification.renewalReminderDays : 60,
      skillId: certification?.skillId ?? null,
      courseId: certification?.courseId ?? null,
    });
  }

  protected fieldError(
    name: 'name' | 'issuer' | 'credentialId' | 'url' | 'issuedOn' | 'expiresOn',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'issuedOn') {
      return control.errors?.['required'] ? 'When was it issued?' : dateFieldError(control.errors);
    }
    if (name === 'expiresOn') {
      return (
        dateFieldError(control.errors) ??
        (this.form.errors?.['expiresBeforeIssued'] ? "It can't expire before it was issued." : null)
      );
    }
    if (control.errors?.['required']) {
      return 'Name the certification.';
    }
    return control.errors?.['maxlength']
      ? {
          name: 'Keep the name under 200 characters.',
          issuer: 'Keep the issuer under 200 characters.',
          credentialId: 'That ID is too long.',
          url: 'That link is too long.',
        }[name]
      : null;
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
    this.learningService
      .saveCertification(this.certification()?.id ?? null, {
        name: v.name,
        issuer: v.issuer.trim() || null,
        credentialId: v.credentialId.trim() || null,
        url: v.url.trim() || null,
        issuedOn: v.issuedOn!,
        expiresOn: v.expiresOn,
        // No expiry, nothing to renew.
        renewalReminderDays: v.expiresOn ? v.renewalReminderDays : null,
        skillId: v.skillId,
        courseId: v.courseId,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (certification) => this.activeModal.close({ kind: 'saved', certification }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the certification.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const certification = this.certification();
    if (!certification) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${certification.name}"?`,
      text: 'Its renewal reminder, links and other reminders go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeCertification(certification.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the certification.')),
    });
  }
}
