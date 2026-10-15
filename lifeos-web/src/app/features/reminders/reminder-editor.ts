import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  NgbActiveModal,
  NgbInputDatepicker,
  NgbModal,
  NgbTimeStruct,
  NgbTimepicker,
} from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { toLocalIsoDate } from '../../core/dates/today';
import {
  Reminder,
  REMINDER_TARGET_LABELS,
  ReminderPayload,
  ReminderTargetType,
  RemindersService,
} from '../../core/services/reminders.service';
import { ToastService } from '../../core/services/toast.service';
import { localDateTimeToUtc, utcToLocalParts } from '../calendar/calendar-feed';
import { defaultRemindAt } from './reminder-times';

/** What a new reminder is about, and the title to start from (usually the target's own). */
export interface ReminderDraft {
  title?: string;
  target?: { entityType: ReminderTargetType; entityId: number; title: string };
}

export type ReminderEditorResult = { kind: 'saved' } | { kind: 'deleted' };

/** Opens the editor for an existing reminder or a draft; resolves with what happened, or null if dismissed. */
export async function openReminderEditor(
  modal: NgbModal,
  target: { reminder: Reminder } | { draft: ReminderDraft },
): Promise<ReminderEditorResult | null> {
  const modalRef = modal.open(ReminderEditor, { ariaLabelledBy: 'reminder-editor-heading' });
  (modalRef.componentInstance as ReminderEditor).configure(target);
  try {
    return (await modalRef.result) as ReminderEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-reminder-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgbTimepicker],
  templateUrl: './reminder-editor.html',
})
export class ReminderEditor {
  private readonly fb = inject(FormBuilder);
  private readonly remindersService = inject(RemindersService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly reminder = signal<Reminder | null>(null);
  protected readonly draftTarget = signal<ReminderDraft['target'] | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    date: this.fb.control<string | null>(null, Validators.required),
    time: this.fb.control<NgbTimeStruct | null>(null, Validators.required),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(target: { reminder: Reminder } | { draft: ReminderDraft }): void {
    if ('reminder' in target) {
      const r = target.reminder;
      this.reminder.set(r);
      const at = utcToLocalParts(r.remindAt);
      this.form.reset({
        title: r.title,
        date: at.date,
        time: { hour: at.hour, minute: at.minute, second: 0 },
        notes: r.notes ?? '',
      });
    } else {
      this.draftTarget.set(target.draft.target ?? null);
      const at = defaultRemindAt(new Date());
      this.form.reset({
        title: target.draft.title ?? '',
        date: toLocalIsoDate(at),
        time: { hour: at.getHours(), minute: at.getMinutes(), second: 0 },
        notes: '',
      });
    }
  }

  /** The target line shown under the title: the saved reminder's target, or the draft's. */
  protected targetLabel(): string | null {
    const r = this.reminder();
    if (r) {
      return r.entityType
        ? `${REMINDER_TARGET_LABELS[r.entityType]}: ${r.entityTitle ?? '(no longer available)'}`
        : null;
    }
    const t = this.draftTarget();
    return t ? `${REMINDER_TARGET_LABELS[t.entityType]}: ${t.title}` : null;
  }

  protected fieldError(name: 'title' | 'date' | 'time' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }

    if (name === 'date') {
      return (
        dateFieldError(control.errors) ??
        (control.errors?.['required'] ? 'Pick the day to be reminded.' : null)
      );
    }

    const errors = control.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return name === 'time' ? 'Pick a time.' : 'Say what to remind you about.';
    }
    if (errors['maxlength']) {
      return name === 'notes'
        ? 'Keep the notes under 4000 characters.'
        : 'Keep the title under 200 characters.';
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
    const payload: ReminderPayload = {
      title: v.title,
      notes: v.notes.trim() || null,
      remindAt: localDateTimeToUtc(v.date!, v.time!.hour, v.time!.minute),
    };

    const existing = this.reminder();
    const target = this.draftTarget();
    const request = existing
      ? this.remindersService.update(existing.id, payload)
      : this.remindersService.create({
          ...payload,
          entityType: target?.entityType ?? null,
          entityId: target?.entityId ?? null,
        });

    this.saving.set(true);
    request.subscribe({
      next: () => this.activeModal.close({ kind: 'saved' } as ReminderEditorResult),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message ?? 'Could not save the reminder.');
      },
    });
  }

  protected async remove(): Promise<void> {
    const existing = this.reminder();
    if (!existing) {
      return;
    }

    const result = await Swal.fire({
      title: `Delete "${existing.title}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete reminder',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.remindersService.remove(existing.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' } as ReminderEditorResult),
      error: (err) => this.toast.error(err.error?.message ?? 'Could not delete the reminder.'),
    });
  }
}
