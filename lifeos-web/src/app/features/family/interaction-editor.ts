import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Contact, ContactsService } from '../../core/services/contacts.service';
import {
  FamilyLogService,
  Interaction,
  InteractionKind,
} from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { INTERACTION_KINDS } from './family-log-view';

export type InteractionEditorResult =
  { kind: 'saved'; interaction: Interaction } | { kind: 'deleted' };

/**
 * Opens the "were in touch" dialog: an existing interaction, or a new one with these people already chosen (the
 * person page passes its person). Resolves with what happened, or null if dismissed.
 */
export async function openInteractionEditor(
  modal: NgbModal,
  interaction?: Interaction,
  withContactIds: number[] = [],
): Promise<InteractionEditorResult | null> {
  const modalRef = modal.open(InteractionEditor, { ariaLabelledBy: 'interaction-editor-heading' });
  (modalRef.componentInstance as InteractionEditor).configure(interaction, withContactIds);
  try {
    return (await modalRef.result) as InteractionEditorResult;
  } catch {
    return null;
  }
}

/** One time you were in touch — a call, a visit, a message — with one or more people. */
@Component({
  selector: 'app-interaction-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="interaction-editor-heading" class="modal-title h5">
          {{ interaction() ? 'Edit time in touch' : 'Log time in touch' }}
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
            <label class="form-label" for="interaction-day">Day</label>
            <div class="input-group">
              <input
                id="interaction-day"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('occurredOn')"
                formControlName="occurredOn"
                placeholder="e.g. 19/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #dayPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="dayPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('occurredOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="interaction-kind">How</label>
            <select id="interaction-kind" class="form-select" formControlName="kind">
              @for (k of kinds; track k.value) {
                <option [ngValue]="k.value" [selected]="k.value === form.controls.kind.value">
                  {{ k.label }}
                </option>
              }
            </select>
          </div>
        </div>

        <div>
          <label class="form-label" for="interaction-add-person">With</label>
          @if (chosen().length > 0) {
            <div class="d-flex flex-wrap gap-2 mb-2">
              @for (c of chosen(); track c.id) {
                <span
                  class="badge rounded-pill text-bg-light border fw-normal d-inline-flex align-items-center gap-1"
                >
                  {{ c.name }}
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0 text-body-secondary"
                    [attr.aria-label]="'Remove ' + c.name"
                    (click)="removePerson(c.id)"
                  >
                    <i class="bi bi-x"></i>
                  </button>
                </span>
              }
            </div>
          }
          <select
            id="interaction-add-person"
            class="form-select"
            [class.is-invalid]="peopleError()"
            (change)="addPerson($any($event.target))"
          >
            <option value="" selected>
              {{
                loadingPeople()
                  ? 'Loading…'
                  : chosen().length
                    ? 'Add someone else…'
                    : 'Choose who it was with…'
              }}
            </option>
            @for (c of addable(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
          @if (peopleError(); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        <div>
          <label class="form-label" for="interaction-summary">
            What happened <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="interaction-summary"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('summary')"
            formControlName="summary"
            placeholder="e.g. Sunday lunch at Mum's"
            autocomplete="off"
          />
          @if (fieldError('summary'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="interaction-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="interaction-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Anything worth remembering — news, plans, what to ask next time"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (interaction()) {
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
export class InteractionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly familyLog = inject(FamilyLogService);
  private readonly contactsService = inject(ContactsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = INTERACTION_KINDS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly interaction = signal<Interaction | null>(null);
  protected readonly contacts = signal<Contact[]>([]);
  protected readonly loadingPeople = signal(true);
  protected readonly contactIds = signal<number[]>([]);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);

  protected readonly chosen = computed(() => {
    const byId = new Map(this.contacts().map((c) => [c.id, c.name]));
    // Names from the interaction itself until the contact list arrives.
    for (const p of this.interaction()?.people ?? []) {
      if (!byId.has(p.contactId)) {
        byId.set(p.contactId, p.name);
      }
    }
    return this.contactIds().map((id) => ({ id, name: byId.get(id) ?? '…' }));
  });
  protected readonly addable = computed(() =>
    this.contacts().filter((c) => !this.contactIds().includes(c.id)),
  );

  protected readonly form = this.fb.group({
    occurredOn: this.fb.control<string | null>(todayIso(), Validators.required),
    kind: this.fb.nonNullable.control<InteractionKind>('Call'),
    summary: this.fb.nonNullable.control('', Validators.maxLength(500)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  constructor() {
    this.contactsService.list().subscribe({
      next: (contacts) => {
        this.contacts.set(contacts);
        this.loadingPeople.set(false);
      },
      error: (err) => {
        this.loadingPeople.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not load your contacts.'));
      },
    });
  }

  configure(interaction: Interaction | undefined, withContactIds: number[]): void {
    this.interaction.set(interaction ?? null);
    this.contactIds.set(
      interaction ? interaction.people.map((p) => p.contactId) : [...withContactIds],
    );
    this.form.reset({
      occurredOn: interaction?.occurredOn ?? todayIso(),
      kind: interaction?.kind ?? 'Call',
      summary: interaction?.summary ?? '',
      notes: interaction?.notes ?? '',
    });
  }

  protected addPerson(select: HTMLSelectElement): void {
    const id = Number(select.value);
    if (id) {
      this.contactIds.update((ids) => [...ids, id]);
    }
    select.value = '';
  }

  protected removePerson(id: number): void {
    this.contactIds.update((ids) => ids.filter((x) => x !== id));
  }

  protected peopleError(): string | null {
    return this.attempted() && this.contactIds().length === 0 ? 'Choose who it was with.' : null;
  }

  protected fieldError(name: 'occurredOn' | 'summary' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (name === 'occurredOn') {
      const value = control.value;
      if ((control.touched || this.attempted()) && !control.errors && value && value > todayIso()) {
        return "That day hasn't come yet.";
      }
    }
    if (!control.errors || (!control.touched && !this.attempted())) {
      return null;
    }
    if (name === 'occurredOn') {
      return control.errors['required'] ? 'Choose the day.' : dateFieldError(control.errors);
    }
    return 'That is too long.';
  }

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.fieldError('occurredOn') || this.peopleError()) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.familyLog
      .saveInteraction(this.interaction()?.id ?? null, {
        occurredOn: v.occurredOn!,
        kind: v.kind,
        summary: v.summary.trim() || null,
        notes: v.notes.trim() || null,
        contactIds: this.contactIds(),
      })
      .subscribe({
        next: (interaction) => this.activeModal.close({ kind: 'saved', interaction }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save it.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const interaction = this.interaction();
    if (!interaction) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this?',
      text: 'Whoever it was with goes back to the last time you were in touch before it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.familyLog.removeInteraction(interaction.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }
}
