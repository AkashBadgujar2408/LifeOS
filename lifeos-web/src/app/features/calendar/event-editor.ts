import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  NgbActiveModal,
  NgbInputDatepicker,
  NgbModal,
  NgbTimeStruct,
  NgbTimepicker,
} from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import {
  CalendarEvent,
  CalendarEventPayload,
  CalendarService,
  EVENT_ENTITY_TYPE,
} from '../../core/services/calendar.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { localDateTimeToUtc, utcToLocalParts } from './calendar-feed';

/** Starting values for a new event, already in local terms (what the user clicked on). */
export interface EventDraft {
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startTime?: NgbTimeStruct;
  endTime?: NgbTimeStruct;
}

export type EventEditorResult = { kind: 'saved' } | { kind: 'deleted' };

/** Opens the editor for an existing event or a draft; resolves with what happened, or null if dismissed. */
export async function openEventEditor(
  modal: NgbModal,
  target: { event: CalendarEvent } | { draft: EventDraft },
): Promise<EventEditorResult | null> {
  const modalRef = modal.open(EventEditor, { ariaLabelledBy: 'event-editor-heading', size: 'lg' });
  (modalRef.componentInstance as EventEditor).configure(target);
  try {
    return (await modalRef.result) as EventEditorResult;
  } catch {
    return null;
  }
}

const time = (hour: number, minute: number): NgbTimeStruct => ({ hour, minute, second: 0 });
const minutesOf = (t: NgbTimeStruct) => t.hour * 60 + t.minute;

// Mirrors CK_Events_Shape: all-day needs last day >= first day; timed needs both times and end >= start.
function eventShape(group: AbstractControl): ValidationErrors | null {
  const v = group.value as {
    isAllDay: boolean;
    startDate: string | null;
    endDate: string | null;
    startTime: NgbTimeStruct | null;
    endTime: NgbTimeStruct | null;
  };
  if (!v.startDate || !v.endDate) {
    return null; // The date controls report their own "required".
  }
  if (v.endDate < v.startDate) {
    return { endBeforeStart: true };
  }
  if (!v.isAllDay) {
    if (!v.startTime || !v.endTime) {
      return { timesRequired: true };
    }
    if (v.endDate === v.startDate && minutesOf(v.endTime) < minutesOf(v.startTime)) {
      return { endBeforeStart: true };
    }
  }
  return null;
}

@Component({
  selector: 'app-event-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgbTimepicker, LinkedItems, EntityReminders],
  templateUrl: './event-editor.html',
})
export class EventEditor {
  private readonly fb = inject(FormBuilder);
  private readonly calendarService = inject(CalendarService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly eventEntityType = EVENT_ENTITY_TYPE;
  protected readonly event = signal<CalendarEvent | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      isAllDay: this.fb.nonNullable.control(false),
      startDate: this.fb.control<string | null>(null, Validators.required),
      endDate: this.fb.control<string | null>(null, Validators.required),
      startTime: this.fb.control<NgbTimeStruct | null>(null),
      endTime: this.fb.control<NgbTimeStruct | null>(null),
      location: this.fb.nonNullable.control('', Validators.maxLength(200)),
      notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    },
    { validators: eventShape },
  );

  constructor() {
    // Moving the first day past the last drags the last day along, rather than leaving an invalid range.
    this.form.controls.startDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((start) => {
      const end = this.form.controls.endDate.value;
      if (start && (!end || end < start)) {
        this.form.controls.endDate.setValue(start);
      }
    });
  }

  configure(target: { event: CalendarEvent } | { draft: EventDraft }): void {
    if ('event' in target) {
      const e = target.event;
      this.event.set(e);
      const start = e.startsAt ? utcToLocalParts(e.startsAt) : null;
      const end = e.endsAt ? utcToLocalParts(e.endsAt) : null;
      this.form.reset({
        title: e.title,
        isAllDay: e.isAllDay,
        startDate: e.isAllDay ? e.startDate : start!.date,
        endDate: e.isAllDay ? e.endDate : end!.date,
        startTime: start ? time(start.hour, start.minute) : time(9, 0),
        endTime: end ? time(end.hour, end.minute) : time(10, 0),
        location: e.location ?? '',
        notes: e.notes ?? '',
      });
    } else {
      const d = target.draft;
      this.form.reset({
        title: '',
        isAllDay: d.isAllDay,
        startDate: d.startDate,
        endDate: d.endDate,
        startTime: d.startTime ?? time(9, 0),
        endTime: d.endTime ?? time(10, 0),
        location: '',
        notes: '',
      });
    }
  }

  protected fieldError(
    name: 'title' | 'startDate' | 'endDate' | 'times' | 'location' | 'notes',
  ): string | null {
    if (name === 'times') {
      const touched = this.form.controls.startTime.touched || this.form.controls.endTime.touched;
      if (!touched && !this.form.controls.title.touched) {
        return null;
      }
      return this.form.errors?.['timesRequired'] ? 'Pick a start and an end time.' : null;
    }

    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }

    if (name === 'startDate' || name === 'endDate') {
      const parseError = dateFieldError(control.errors);
      if (parseError) {
        return parseError;
      }
      if (control.errors?.['required']) {
        return name === 'startDate' ? 'Pick the day it starts.' : 'Pick the day it ends.';
      }
      return name === 'endDate' && this.form.errors?.['endBeforeStart']
        ? "It can't end before it starts."
        : null;
    }

    const errors = control.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return 'Give the event a title.';
    }
    if (errors['maxlength']) {
      return {
        title: 'Keep the title under 200 characters.',
        location: 'Keep the location under 200 characters.',
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
    const payload: CalendarEventPayload = {
      title: v.title,
      notes: v.notes.trim() || null,
      location: v.location.trim() || null,
      isAllDay: v.isAllDay,
      startDate: v.isAllDay ? v.startDate : null,
      endDate: v.isAllDay ? v.endDate : null,
      startsAt: v.isAllDay
        ? null
        : localDateTimeToUtc(v.startDate!, v.startTime!.hour, v.startTime!.minute),
      endsAt: v.isAllDay
        ? null
        : localDateTimeToUtc(v.endDate!, v.endTime!.hour, v.endTime!.minute),
    };

    const existing = this.event();
    const request = existing
      ? this.calendarService.updateEvent(existing.id, payload)
      : this.calendarService.createEvent(payload);

    this.saving.set(true);
    request.subscribe({
      next: () => this.activeModal.close({ kind: 'saved' } as EventEditorResult),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message ?? 'Could not save the event.');
      },
    });
  }

  protected async remove(): Promise<void> {
    const existing = this.event();
    if (!existing) {
      return;
    }

    const result = await Swal.fire({
      title: `Delete "${existing.title}"?`,
      text: 'Its links and reminders go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete event',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.calendarService.deleteEvent(existing.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' } as EventEditorResult),
      error: (err) => this.toast.error(err.error?.message ?? 'Could not delete the event.'),
    });
  }
}
