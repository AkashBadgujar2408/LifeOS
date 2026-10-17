import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  DocumentPayload,
  DocumentsService,
  LifeDocument,
} from '../../core/services/documents.service';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { EXPIRY_REMINDER_OPTIONS, KIND_META } from './document-view';

/** Opens the create/edit dialog; resolves with the saved document, or null if it was dismissed. */
export async function openDocumentEditor(
  modal: NgbModal,
  document?: LifeDocument,
): Promise<LifeDocument | null> {
  const modalRef = modal.open(DocumentEditor, {
    ariaLabelledBy: 'document-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as DocumentEditor).configure(document);
  try {
    return (await modalRef.result) as LifeDocument;
  } catch {
    return null;
  }
}

// Mirrors CK_Documents_Dates and CK_Documents_ExpiryReminderDays.
function documentRules(group: AbstractControl): ValidationErrors | null {
  const { issuedOn, expiresOn, expiryReminderDays } = group.value as {
    issuedOn: string | null;
    expiresOn: string | null;
    expiryReminderDays: number | null;
  };
  if (issuedOn && expiresOn && expiresOn < issuedOn) {
    return { expiresBeforeIssued: true };
  }
  if (expiryReminderDays !== null && !expiresOn) {
    return { reminderWithoutExpiry: true };
  }
  return null;
}

@Component({
  selector: 'app-document-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, TagPicker],
  templateUrl: './document-editor.html',
})
export class DocumentEditor {
  private readonly fb = inject(FormBuilder);
  private readonly documentsService = inject(DocumentsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = DOCUMENT_KINDS;
  protected readonly kindMeta = KIND_META;
  protected readonly reminderOptions = EXPIRY_REMINDER_OPTIONS;
  // Passports and degrees can be decades old; ng-bootstrap only goes back 10 years by default.
  protected readonly minDate = { year: 1940, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };

  protected readonly document = signal<LifeDocument | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      kind: this.fb.nonNullable.control<DocumentKind>('Identity'),
      issuer: this.fb.nonNullable.control('', Validators.maxLength(200)),
      number: this.fb.nonNullable.control('', Validators.maxLength(40)),
      issuedOn: this.fb.control<string | null>(null),
      expiresOn: this.fb.control<string | null>(null),
      expiryReminderDays: this.fb.control<number | null>(null),
      isVault: this.fb.nonNullable.control(false),
      notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    },
    { validators: documentRules },
  );

  configure(document?: LifeDocument): void {
    this.document.set(document ?? null);
    this.tagIds.set(document?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      title: document?.title ?? '',
      kind: document?.kind ?? 'Identity',
      issuer: document?.issuer ?? '',
      // Only the last 4 were ever stored; sending them back keeps them.
      number: document?.numberLast4 ?? '',
      issuedOn: document?.issuedOn ?? null,
      expiresOn: document?.expiresOn ?? null,
      expiryReminderDays: document ? document.expiryReminderDays : 30,
      isVault: document?.isVault ?? false,
      notes: document?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'title' | 'issuer' | 'number' | 'issuedOn' | 'expiresOn' | 'reminder' | 'notes',
  ): string | null {
    if (name === 'reminder') {
      return this.form.errors?.['reminderWithoutExpiry'] && this.form.controls.expiresOn.touched
        ? 'Add an expiry date, or choose "Don\'t remind me".'
        : null;
    }

    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'issuedOn' || name === 'expiresOn') {
      return (
        dateFieldError(control.errors) ??
        (name === 'expiresOn' && this.form.errors?.['expiresBeforeIssued']
          ? "It can't expire before it was issued."
          : null)
      );
    }
    if (control.errors?.['required']) {
      return 'Give the document a title.';
    }
    if (control.errors?.['maxlength']) {
      return {
        title: 'Keep the title under 200 characters.',
        issuer: 'Keep the issuer under 200 characters.',
        number: 'That number is too long.',
        notes: 'Keep the notes under 4000 characters.',
      }[name];
    }
    return null;
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const payload: DocumentPayload = {
      title: v.title,
      kind: v.kind,
      issuer: v.issuer.trim() || null,
      number: v.number.trim() || null,
      issuedOn: v.issuedOn,
      expiresOn: v.expiresOn,
      notes: v.notes.trim() || null,
      isVault: v.isVault,
      expiryReminderDays: v.expiresOn ? v.expiryReminderDays : null,
      timeZone: browserTimeZone(),
      tagIds: this.tagIds(),
    };

    const existing = this.document();
    this.saving.set(true);
    (existing
      ? this.documentsService.update(existing.id, payload)
      : this.documentsService.create(payload)
    ).subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the document.'));
      },
    });
  }
}
