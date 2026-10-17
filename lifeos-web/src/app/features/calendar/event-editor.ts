import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { addDaysIso, browserTimeZone, localMidnight } from '../../core/dates/today';
import {
  CalendarEvent,
  CalendarEventPayload,
  CalendarService,
  EVENT_ENTITY_TYPE,
} from '../../core/services/calendar.service';
import { RECURRENCE_FREQUENCIES, RecurrenceFrequency } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { localDateTimeToUtc, utcToLocalParts } from './calendar-feed';
import {
  formatIsoDate,
  intervalUnit,
  longerThanGap,
  recurrenceSummary,
  weekdayName,
  REMIND_BEFORE_OPTIONS,
} from './event-recurrence';
import { apiErrorMessage } from '../../core/services/api-error';

/** Starting values for a new event, already in local terms (what the user clicked on). */
export interface EventDraft {
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startTime?: NgbTimeStruct;
  endTime?: NgbTimeStruct;
}

/** The occurrence of a series that was clicked: its day in the series and its own dates/times. */
export interface EventOccurrenceRef {
  occurrenceDate: string;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export type EventEditorResult =
  | { kind: 'saved' }
  | { kind: 'deleted' }
  | { kind: 'skipped' }
  | { kind: 'detached' }
  | { kind: 'ended'; seriesDeleted: boolean };

export type EventEditorTarget =
  { event: CalendarEvent; occurrence?: EventOccurrenceRef } | { draft: EventDraft };

/** Opens the editor for an existing event or a draft; resolves with what happened, or null if dismissed. */
export async function openEventEditor(
  modal: NgbModal,
  target: EventEditorTarget,
): Promise<EventEditorResult | null> {
  const modalRef = modal.open(EventEditor, { ariaLabelledBy: 'event-editor-heading', size: 'lg' });
  (modalRef.componentInstance as EventEditor).configure(target);
  try {
    return (await modalRef.result) as EventEditorResult;
  } catch {
    return null;
  }
}

/** The toast for what happened in the editor. */
export function eventResultMessage(result: EventEditorResult): string {
  switch (result.kind) {
    case 'saved':
      return 'Event saved.';
    case 'deleted':
      return 'Event deleted.';
    case 'skipped':
      return 'Skipped that one.';
    case 'detached':
      return 'Changed just that one.';
    case 'ended':
      return result.seriesDeleted ? 'Series deleted.' : 'Series ends before that one now.';
  }
}

const time = (hour: number, minute: number): NgbTimeStruct => ({ hour, minute, second: 0 });
const minutesOf = (t: NgbTimeStruct) => t.hour * 60 + t.minute;

interface EventFormValue {
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startTime: NgbTimeStruct | null;
  endTime: NgbTimeStruct | null;
  repeat: RecurrenceFrequency | 'None';
  interval: number;
  until: string | null;
}

/** The event's length in minutes (all-day: whole days), or null while the dates/times are incomplete. */
function lengthMinutes(v: EventFormValue): number | null {
  if (!v.startDate || !v.endDate) {
    return null;
  }
  if (v.isAllDay) {
    return (
      (localMidnight(v.endDate).getTime() - localMidnight(v.startDate).getTime()) / 60000 + 1440
    );
  }
  if (!v.startTime || !v.endTime) {
    return null;
  }
  const start = localMidnight(v.startDate);
  start.setHours(v.startTime.hour, v.startTime.minute);
  const end = localMidnight(v.endDate);
  end.setHours(v.endTime.hour, v.endTime.minute);
  return (end.getTime() - start.getTime()) / 60000;
}

// Mirrors CK_Events_Shape (all-day needs last day >= first day; timed needs both times and end >= start) and
// CK_Events_Recurrence (repeats end on/after the first day, and one occurrence can't outlast the gap to the next).
function eventShape(group: AbstractControl): ValidationErrors | null {
  const v = group.value as EventFormValue;
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
  if (v.repeat !== 'None') {
    if (v.until && v.until < v.startDate) {
      return { untilBeforeStart: true };
    }
    const length = lengthMinutes(v);
    if (length !== null && v.interval >= 1 && longerThanGap(v.repeat, v.interval, length)) {
      return { longerThanGap: true };
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
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly eventEntityType = EVENT_ENTITY_TYPE;
  protected readonly frequencies = RECURRENCE_FREQUENCIES;
  protected readonly formatIsoDate = formatIsoDate;
  protected readonly weekdayName = weekdayName;
  protected readonly remindBeforeOptions = REMIND_BEFORE_OPTIONS;

  protected readonly event = signal<CalendarEvent | null>(null);
  /** The occurrence that was clicked, when the event is a series. */
  protected readonly occurrence = signal<EventOccurrenceRef | null>(null);
  /** 'occurrence' after "Change just this one": the form edits a one-off copy of that occurrence. */
  protected readonly mode = signal<'series' | 'occurrence'>('series');
  protected readonly saving = signal(false);

  protected readonly isSeries = computed(() => !!this.event()?.recurrence);

  /** "Every week on Tuesday" for the saved series, from its first occurrence. */
  protected readonly savedSummary = computed(() => {
    const e = this.event();
    if (!e?.recurrence) {
      return null;
    }
    const first = e.isAllDay ? e.startDate! : utcToLocalParts(e.startsAt!).date;
    return recurrenceSummary(e.recurrence, first);
  });

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      isAllDay: this.fb.nonNullable.control(false),
      startDate: this.fb.control<string | null>(null, Validators.required),
      endDate: this.fb.control<string | null>(null, Validators.required),
      startTime: this.fb.control<NgbTimeStruct | null>(null),
      endTime: this.fb.control<NgbTimeStruct | null>(null),
      repeat: this.fb.nonNullable.control<RecurrenceFrequency | 'None'>('None'),
      interval: this.fb.nonNullable.control(1, [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
      ]),
      until: this.fb.control<string | null>(null),
      remindBefore: this.fb.control<number | null>(null),
      lifeAreaId: this.fb.control<number | null>(null),
      location: this.fb.nonNullable.control('', Validators.maxLength(200)),
      notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    },
    { validators: eventShape },
  );

  /** Live wording for the repeat being edited. */
  protected readonly draftSummary = signal<string | null>(null);

  constructor() {
    // Moving the first day past the last drags the last day along, rather than leaving an invalid range.
    this.form.controls.startDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((start) => {
      const end = this.form.controls.endDate.value;
      if (start && (!end || end < start)) {
        this.form.controls.endDate.setValue(start);
      }
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.updateDraftSummary());
  }

  configure(target: EventEditorTarget): void {
    if ('event' in target) {
      const e = target.event;
      this.event.set(e);
      this.occurrence.set(e.recurrence ? (target.occurrence ?? null) : null);
      const start = e.startsAt ? utcToLocalParts(e.startsAt) : null;
      const end = e.endsAt ? utcToLocalParts(e.endsAt) : null;
      this.form.reset({
        title: e.title,
        isAllDay: e.isAllDay,
        startDate: e.isAllDay ? e.startDate : start!.date,
        endDate: e.isAllDay ? e.endDate : end!.date,
        startTime: start ? time(start.hour, start.minute) : time(9, 0),
        endTime: end ? time(end.hour, end.minute) : time(10, 0),
        repeat: e.recurrence?.frequency ?? 'None',
        interval: e.recurrence?.interval ?? 1,
        until: e.recurrence?.until ?? null,
        remindBefore: e.reminderMinutesBefore,
        lifeAreaId: e.lifeAreaId,
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
        repeat: 'None',
        interval: 1,
        until: null,
        remindBefore: null,
        lifeAreaId: null,
        location: '',
        notes: '',
      });
    }
    this.updateDraftSummary();
  }

  protected intervalUnit(): string {
    const { repeat, interval } = this.form.getRawValue();
    return repeat === 'None' ? '' : intervalUnit(repeat, interval);
  }

  private updateDraftSummary(): void {
    const { repeat, interval, until, startDate } = this.form.getRawValue();
    this.draftSummary.set(
      repeat !== 'None' && startDate && interval >= 1 && interval <= 999
        ? recurrenceSummary({ frequency: repeat, interval, until }, startDate)
        : null,
    );
  }

  protected fieldError(
    name:
      | 'title'
      | 'startDate'
      | 'endDate'
      | 'times'
      | 'interval'
      | 'until'
      | 'repeat'
      | 'location'
      | 'notes',
  ): string | null {
    if (name === 'times') {
      const touched = this.form.controls.startTime.touched || this.form.controls.endTime.touched;
      if (!touched && !this.form.controls.title.touched) {
        return null;
      }
      return this.form.errors?.['timesRequired'] ? 'Pick a start and an end time.' : null;
    }

    if (name === 'repeat') {
      return this.form.errors?.['longerThanGap']
        ? "It's longer than the gap between repeats, so they'd overlap. Shorten it or repeat less often."
        : null;
    }

    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }

    if (name === 'startDate' || name === 'endDate' || name === 'until') {
      const parseError = dateFieldError(control.errors);
      if (parseError) {
        return parseError;
      }
      if (name === 'until') {
        return this.form.errors?.['untilBeforeStart']
          ? "The repeats can't end before the event first happens."
          : null;
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
    if (name === 'interval') {
      return 'Repeat every 1 to 999.';
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
    const repeats = v.repeat !== 'None' && this.mode() === 'series';
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
      recurrence: repeats
        ? { frequency: v.repeat as RecurrenceFrequency, interval: v.interval, until: v.until }
        : null,
      timeZone: repeats && !v.isAllDay ? browserTimeZone() : null,
      // Only a timed series can remind before each occurrence; anything else leaves it off.
      reminderMinutesBefore: repeats && !v.isAllDay ? v.remindBefore : null,
      lifeAreaId: v.lifeAreaId,
    };

    const existing = this.event();
    const occurrence = this.occurrence();
    let request;
    let result: EventEditorResult = { kind: 'saved' };
    if (existing && occurrence && this.mode() === 'occurrence') {
      request = this.calendarService.detachOccurrence(
        existing.id,
        occurrence.occurrenceDate,
        payload,
      );
      result = { kind: 'detached' };
    } else {
      request = existing
        ? this.calendarService.updateEvent(existing.id, payload)
        : this.calendarService.createEvent(payload);
    }

    this.saving.set(true);
    request.subscribe({
      next: () => this.activeModal.close(result),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the event.'));
      },
    });
  }

  /** "Change just this one": the form now edits a one-off copy of the clicked occurrence. */
  protected editJustThisOne(): void {
    const occurrence = this.occurrence();
    if (!occurrence) {
      return;
    }
    const v = this.form.getRawValue();
    const start = occurrence.startsAt ? utcToLocalParts(occurrence.startsAt) : null;
    const end = occurrence.endsAt ? utcToLocalParts(occurrence.endsAt) : null;
    this.mode.set('occurrence');
    this.form.reset({
      ...v,
      startDate: v.isAllDay ? occurrence.startDate : start!.date,
      endDate: v.isAllDay ? occurrence.endDate : end!.date,
      startTime: start ? time(start.hour, start.minute) : v.startTime,
      endTime: end ? time(end.hour, end.minute) : v.endTime,
      repeat: 'None',
      interval: 1,
      until: null,
    });
  }

  protected skipThisOne(): void {
    const existing = this.event();
    const occurrence = this.occurrence();
    if (!existing || !occurrence) {
      return;
    }
    this.calendarService.setSkipped(existing.id, occurrence.occurrenceDate, true).subscribe({
      next: () => this.activeModal.close({ kind: 'skipped' } as EventEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not skip it.')),
    });
  }

  protected restore(date: string): void {
    const existing = this.event();
    if (!existing) {
      return;
    }
    this.calendarService.setSkipped(existing.id, date, false).subscribe({
      next: (event) => {
        this.event.set(event);
        this.toast.success(`${formatIsoDate(date)} is back on.`);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not restore it.')),
    });
  }

  protected async endFromHere(): Promise<void> {
    const existing = this.event();
    const occurrence = this.occurrence();
    if (!existing || !occurrence) {
      return;
    }

    const result = await Swal.fire({
      title: `Delete this and every later "${existing.title}"?`,
      text: `The series will end on ${formatIsoDate(addDaysIso(occurrence.occurrenceDate, -1))}. Earlier ones stay.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete from here',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.calendarService.endSeries(existing.id, occurrence.occurrenceDate).subscribe({
      next: (seriesDeleted) =>
        this.activeModal.close({ kind: 'ended', seriesDeleted } as EventEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not end the series.')),
    });
  }

  protected async remove(): Promise<void> {
    const existing = this.event();
    if (!existing) {
      return;
    }

    const series = !!existing.recurrence;
    const result = await Swal.fire({
      title: series ? `Delete every "${existing.title}"?` : `Delete "${existing.title}"?`,
      text: series
        ? 'The whole series goes, past and future, with its links and reminders.'
        : 'Its links and reminders go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: series ? 'Delete series' : 'Delete event',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.calendarService.deleteEvent(existing.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' } as EventEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the event.')),
    });
  }
}
