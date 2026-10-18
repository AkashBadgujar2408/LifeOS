import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CONTACT_ENTITY_TYPE,
  Contact,
  ContactsService,
} from '../../core/services/contacts.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';

export type ContactEditorResult = { kind: 'saved'; contact: Contact } | { kind: 'deleted' };

/** Opens the contact dialog (new when missing); resolves with what happened, or null if dismissed. */
export async function openContactEditor(
  modal: NgbModal,
  contact?: Contact,
): Promise<ContactEditorResult | null> {
  const modalRef = modal.open(ContactEditor, {
    ariaLabelledBy: 'contact-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as ContactEditor).configure(contact);
  try {
    return (await modalRef.result) as ContactEditorResult;
  } catch {
    return null;
  }
}

/** A person in the shared contact list: who they are, how to reach them, when you last spoke. */
@Component({
  selector: 'app-contact-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, TagPicker, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="contact-editor-heading" class="modal-title h5">
          {{ contact() ? 'Edit contact' : 'New contact' }}
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
          <label class="form-label" for="contact-name">Name</label>
          <input
            id="contact-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Priya Rao"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="contact-org">
              Organisation <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="contact-org"
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
          <div class="col-sm-6">
            <label class="form-label" for="contact-title">
              Job title <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="contact-title"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('jobTitle')"
              formControlName="jobTitle"
              placeholder="e.g. Engineering Manager"
              autocomplete="off"
            />
            @if (fieldError('jobTitle'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="contact-email">
              Email <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="contact-email"
              type="email"
              class="form-control"
              [class.is-invalid]="fieldError('email')"
              formControlName="email"
              placeholder="name@example.com"
              autocomplete="off"
            />
            @if (fieldError('email'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="contact-phone">
              Phone <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="contact-phone"
              type="tel"
              class="form-control"
              [class.is-invalid]="fieldError('phone')"
              formControlName="phone"
              placeholder="e.g. +91 98200 12345"
              autocomplete="off"
            />
            @if (fieldError('phone'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="contact-last">
            Last in touch <span class="text-body-secondary small">(optional)</span>
          </label>
          <div class="input-group">
            <input
              id="contact-last"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('lastContactedOn')"
              formControlName="lastContactedOn"
              placeholder="e.g. 10/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #lastPicker="ngbDatepicker"
              [minDate]="minDate"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day"
              (click)="lastPicker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fieldError('lastContactedOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="contact-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="contact-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="How you know them, what you talked about"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <span class="form-label d-block">Tags</span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>

        @if (contact(); as existing) {
          <div class="border-top pt-3">
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Contact"
              [entityId]="existing.id"
              [entityTitle]="existing.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (contact()) {
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
export class ContactEditor {
  private readonly fb = inject(FormBuilder);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = CONTACT_ENTITY_TYPE;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly contact = signal<Contact | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    organisation: this.fb.nonNullable.control('', Validators.maxLength(200)),
    jobTitle: this.fb.nonNullable.control('', Validators.maxLength(200)),
    email: this.fb.nonNullable.control('', [Validators.email, Validators.maxLength(320)]),
    phone: this.fb.nonNullable.control('', Validators.maxLength(50)),
    lastContactedOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(contact?: Contact): void {
    this.contact.set(contact ?? null);
    this.tagIds.set(contact?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      name: contact?.name ?? '',
      organisation: contact?.organisation ?? '',
      jobTitle: contact?.jobTitle ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      lastContactedOn: contact?.lastContactedOn ?? null,
      notes: contact?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'name' | 'organisation' | 'jobTitle' | 'email' | 'phone' | 'lastContactedOn' | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'lastContactedOn') {
      return dateFieldError(control.errors);
    }
    if (control.errors['required']) {
      return 'Give the contact a name.';
    }
    if (control.errors['email']) {
      return 'Enter a valid email address.';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.lastContactedOn && v.lastContactedOn > today) {
      this.toast.error("The last time you were in touch can't be in the future.");
      return;
    }
    this.saving.set(true);
    this.contactsService
      .save(this.contact()?.id ?? null, {
        name: v.name,
        organisation: v.organisation.trim() || null,
        jobTitle: v.jobTitle.trim() || null,
        email: v.email.trim() || null,
        phone: v.phone.trim() || null,
        notes: v.notes.trim() || null,
        lastContactedOn: v.lastContactedOn,
        today,
        tagIds: this.tagIds(),
      })
      .subscribe({
        next: (contact) => this.activeModal.close({ kind: 'saved', contact }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the contact.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const contact = this.contact();
    if (!contact) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete ${contact.name}?`,
      text: 'Their links and reminders go too. Applications that named them keep going without them.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.contactsService.remove(contact.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the contact.')),
    });
  }
}
