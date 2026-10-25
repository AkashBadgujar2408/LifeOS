import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { apiErrorMessage } from '../../core/services/api-error';
import { Contact, ContactsService } from '../../core/services/contacts.service';
import {
  FamilyLogService,
  Responsibility,
  ResponsibilityHolder,
} from '../../core/services/family-log.service';
import { TaskItem, TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { HOLDERS } from './family-log-view';

export type ResponsibilityEditorResult =
  { kind: 'saved'; responsibility: Responsibility } | { kind: 'deleted' };

/** Opens the responsibility dialog (new when missing; `forContactId` presets whom it's for). */
export async function openResponsibilityEditor(
  modal: NgbModal,
  responsibility?: Responsibility,
  forContactId?: number,
): Promise<ResponsibilityEditorResult | null> {
  const modalRef = modal.open(ResponsibilityEditor, {
    ariaLabelledBy: 'responsibility-editor-heading',
  });
  (modalRef.componentInstance as ResponsibilityEditor).configure(responsibility, forContactId);
  try {
    return (await modalRef.result) as ResponsibilityEditorResult;
  } catch {
    return null;
  }
}

/** Who looks after what in the family — yours, shared, or someone else's — optionally kept going by a task. */
@Component({
  selector: 'app-responsibility-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="responsibility-editor-heading" class="modal-title h5">
          {{ responsibility() ? 'Edit responsibility' : 'New responsibility' }}
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
          <label class="form-label" for="resp-title">What</label>
          <input
            id="resp-title"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('title')"
            formControlName="title"
            placeholder="e.g. Dad's medicines each month"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('title'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="resp-for">
            For <span class="text-body-secondary small">(optional)</span>
          </label>
          <ng-select labelForId="resp-for" formControlName="contactId" placeholder="The household">
            @for (c of contacts(); track c.id) {
              <ng-option [value]="c.id">
                {{ c.name }}
              </ng-option>
            }
          </ng-select>
        </div>
        <div>
          <span class="form-label d-block">Who looks after it</span>
          <div class="btn-group" role="group" aria-label="Who looks after it">
            @for (h of holders; track h.value) {
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="form.controls.heldBy.value === h.value"
                [class.btn-outline-secondary]="form.controls.heldBy.value !== h.value"
                [attr.aria-pressed]="form.controls.heldBy.value === h.value"
                (click)="setHolder(h.value)"
              >
                {{ h.label }}
              </button>
            }
          </div>
          <div class="form-text">{{ holderHint() }}</div>
        </div>
        @if (form.controls.heldBy.value !== 'Me') {
          <div>
            <label class="form-label" for="resp-holder">
              {{ form.controls.heldBy.value === 'Shared' ? 'Shared with' : 'Who' }}
              @if (form.controls.heldBy.value === 'Shared') {
                <span class="text-body-secondary small">(optional)</span>
              }
            </label>
            <select
              id="resp-holder"
              class="form-select"
              [class.is-invalid]="holderError()"
              formControlName="holderContactId"
            >
              <option [ngValue]="null" [selected]="form.controls.holderContactId.value === null">
                {{ form.controls.heldBy.value === 'Shared' ? 'Several people' : 'Choose…' }}
              </option>
              @for (c of contacts(); track c.id) {
                <option [ngValue]="c.id" [selected]="c.id === form.controls.holderContactId.value">
                  {{ c.name }}
                </option>
              }
            </select>
            @if (holderError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <div>
          <label class="form-label" for="resp-task">
            Kept going by a task <span class="text-body-secondary small">(optional)</span>
          </label>
          <ng-select labelForId="resp-task" formControlName="taskItemId" placeholder="No task">
            @for (t of tasks(); track t.id) {
              <ng-option [value]="t.id">
                {{ t.title }}
              </ng-option>
            }
          </ng-select>
          <div class="form-text">
            A repeating task works best — LifeOS follows it to its latest occurrence.
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="resp-start">
              Since <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="resp-start"
                type="text"
                class="form-control"
                [class.is-invalid]="dateError('startedOn')"
                formControlName="startedOn"
                placeholder="e.g. 01/Jan/2026"
                autocomplete="off"
                ngbDatepicker
                #startPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day it started"
                (click)="startPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (dateError('startedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="resp-end">
              Ended <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="resp-end"
                type="text"
                class="form-control"
                [class.is-invalid]="dateError('endedOn')"
                formControlName="endedOn"
                placeholder="Leave empty while it goes on"
                autocomplete="off"
                ngbDatepicker
                #endPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day it ended"
                (click)="endPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (dateError('endedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="resp-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="resp-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Who to call, where the papers are, how it's split"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (responsibility()) {
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
export class ResponsibilityEditor {
  private readonly fb = inject(FormBuilder);
  private readonly familyLog = inject(FamilyLogService);
  private readonly contactsService = inject(ContactsService);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly holders = HOLDERS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly responsibility = signal<Responsibility | null>(null);
  protected readonly contacts = signal<Contact[]>([]);
  protected readonly tasks = signal<TaskItem[]>([]);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    contactId: this.fb.control<number | null>(null),
    heldBy: this.fb.nonNullable.control<ResponsibilityHolder>('Me'),
    holderContactId: this.fb.control<number | null>(null),
    taskItemId: this.fb.control<number | null>(null),
    startedOn: this.fb.control<string | null>(null),
    endedOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(responsibility?: Responsibility, forContactId?: number): void {
    this.responsibility.set(responsibility ?? null);
    this.form.reset({
      title: responsibility?.title ?? '',
      contactId: responsibility?.contactId ?? forContactId ?? null,
      heldBy: responsibility?.heldBy ?? 'Me',
      holderContactId: responsibility?.holderContactId ?? null,
      taskItemId: responsibility?.taskItemId ?? null,
      startedOn: responsibility?.startedOn ?? null,
      endedOn: responsibility?.endedOn ?? null,
      notes: responsibility?.notes ?? '',
    });
    // Side lists: if one can't load, its choices are simply missing.
    this.contactsService.list().subscribe({
      next: (c) => this.contacts.set(c),
      error: () => this.contacts.set([]),
    });
    this.tasksService.list('Open').subscribe({
      next: (open) => {
        const current = responsibility?.taskItemId;
        // Keep the linked task choosable even when it's done.
        const linked =
          current && !open.some((t) => t.id === current) && responsibility?.taskTitle
            ? [{ id: current, title: responsibility.taskTitle } as TaskItem]
            : [];
        this.tasks.set([...linked, ...open]);
      },
      error: () => this.tasks.set([]),
    });
  }

  protected holderHint(): string {
    return HOLDERS.find((h) => h.value === this.form.controls.heldBy.value)?.hint ?? '';
  }

  protected setHolder(heldBy: ResponsibilityHolder): void {
    this.form.controls.heldBy.setValue(heldBy);
    if (heldBy === 'Me') {
      this.form.controls.holderContactId.setValue(null);
    }
  }

  protected holderError(): string | null {
    return this.attempted() &&
      this.form.controls.heldBy.value === 'Someone' &&
      this.form.controls.holderContactId.value === null
      ? 'Choose who looks after it.'
      : null;
  }

  protected fieldError(name: 'title' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.errors || (!control.touched && !this.attempted())) {
      return null;
    }
    return control.errors['required'] ? 'Say what the responsibility is.' : 'That is too long.';
  }

  protected dateError(name: 'startedOn' | 'endedOn'): string | null {
    const control = this.form.controls[name];
    if (!control.touched && !this.attempted()) {
      return null;
    }
    if (control.errors) {
      return dateFieldError(control.errors);
    }
    const { startedOn, endedOn } = this.form.getRawValue();
    return name === 'endedOn' && startedOn && endedOn && endedOn < startedOn
      ? "It can't end before it started."
      : null;
  }

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (
      this.form.invalid ||
      this.holderError() ||
      this.dateError('startedOn') ||
      this.dateError('endedOn')
    ) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.familyLog
      .saveResponsibility(this.responsibility()?.id ?? null, {
        title: v.title.trim(),
        contactId: v.contactId,
        heldBy: v.heldBy,
        holderContactId: v.heldBy === 'Me' ? null : v.holderContactId,
        taskItemId: v.taskItemId,
        startedOn: v.startedOn,
        endedOn: v.endedOn,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: (responsibility) => this.activeModal.close({ kind: 'saved', responsibility }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save it.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const responsibility = this.responsibility();
    if (!responsibility) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${responsibility.title}"?`,
      text: responsibility.taskItemId ? 'Its task stays in Tasks.' : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.familyLog.removeResponsibility(responsibility.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }
}
