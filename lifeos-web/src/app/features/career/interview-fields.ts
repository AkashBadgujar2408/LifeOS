import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { NgbTimeStruct } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import type { Interview, InterviewPayload } from '../../core/services/career.service';
import { localDateTimeToUtc, utcToLocalParts } from '../calendar/calendar-feed';

/** A round's form: what it is, and — when it's scheduled — the local day and times it runs. */
export type RoundForm = FormGroup<{
  title: FormControl<string>;
  scheduled: FormControl<boolean>;
  date: FormControl<string | null>;
  startTime: FormControl<NgbTimeStruct | null>;
  endTime: FormControl<NgbTimeStruct | null>;
  location: FormControl<string>;
  prepNotes: FormControl<string>;
}>;

const time = (hour: number, minute: number): NgbTimeStruct => ({ hour, minute, second: 0 });
const minutesOf = (t: NgbTimeStruct) => t.hour * 60 + t.minute;

export function roundForm(fb: FormBuilder): RoundForm {
  return fb.group({
    title: fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    scheduled: fb.nonNullable.control(true),
    date: fb.control<string | null>(todayIso()),
    startTime: fb.control<NgbTimeStruct | null>(time(10, 0)),
    endTime: fb.control<NgbTimeStruct | null>(time(11, 0)),
    location: fb.nonNullable.control('', Validators.maxLength(200)),
    prepNotes: fb.nonNullable.control('', Validators.maxLength(4000)),
  });
}

/** Fills the form from a round (or the defaults: today, 10–11 am). */
export function resetRound(form: RoundForm, interview?: Interview | null, title = ''): void {
  const start = interview?.startsAt ? utcToLocalParts(interview.startsAt) : null;
  const end = interview?.endsAt ? utcToLocalParts(interview.endsAt) : null;
  form.reset({
    title: interview?.title ?? title,
    scheduled: interview ? interview.startsAt !== null : true,
    date: start?.date ?? todayIso(),
    startTime: start ? time(start.hour, start.minute) : time(10, 0),
    endTime: end ? time(end.hour, end.minute) : time(11, 0),
    location: interview?.location ?? '',
    prepNotes: interview?.prepNotes ?? '',
  });
}

/** The schedule's problem in words, or null. A round runs within one day. */
export function roundScheduleError(form: RoundForm): string | null {
  const v = form.getRawValue();
  if (!v.scheduled) {
    return null;
  }
  if (!v.date) {
    return 'Pick the day.';
  }
  if (!v.startTime || !v.endTime) {
    return 'Give the start and end time.';
  }
  return minutesOf(v.endTime) <= minutesOf(v.startTime) ? 'It has to end after it starts.' : null;
}

/** The API's shape for the round's what/when (outcome and review notes come from the full editor). */
export function roundPayload(form: RoundForm): Omit<InterviewPayload, 'reviewNotes' | 'outcome'> {
  const v = form.getRawValue();
  const scheduled = v.scheduled && v.date && v.startTime && v.endTime;
  return {
    title: v.title.trim(),
    startsAt: scheduled
      ? localDateTimeToUtc(v.date!, v.startTime!.hour, v.startTime!.minute)
      : null,
    endsAt: scheduled ? localDateTimeToUtc(v.date!, v.endTime!.hour, v.endTime!.minute) : null,
    location: v.location.trim() || null,
    prepNotes: v.prepNotes.trim() || null,
  };
}
