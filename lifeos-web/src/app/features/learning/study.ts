import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { APP_DATE_TIME_FORMAT, dateFieldError } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { LearningService, StudySession } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { sessionSubject, sessionsByDay, studyTotals } from './learning-plan-view';
import { StudyChart } from './study-chart';
import { StudySubject, StudyTimer } from './study-timer';

/** How far back the log shows. */
const LOG_DAYS = 90;

type SubjectKind = 'Skill' | 'Course' | 'Book';

/**
 * The study log: a timer for studying now, a form for time already spent, and the last 90 days of sessions by day
 * with this week's and the last 30 days' totals.
 */
@Component({
  selector: 'app-study',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, NgbInputDatepicker, LoadError, StudyTimer, StudyChart],
  templateUrl: './study.html',
})
export class Study {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatMinutes = formatMinutes;
  /** Bumped whenever the log reloads, so the chart follows. */
  protected readonly version = signal(0);
  protected readonly sessionSubject = sessionSubject;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly today = signal(todayIso());
  protected readonly maxDate = computed(() => {
    const [year, month, day] = this.today().split('-').map(Number);
    return { year, month, day };
  });
  protected readonly minDate = { year: 2000, month: 1, day: 1 };

  protected readonly sessions = signal<StudySession[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly days = computed(() => sessionsByDay(this.sessions() ?? []));
  protected readonly totals = computed(() => studyTotals(this.sessions() ?? [], this.today()));
  protected readonly saving = signal(false);
  protected readonly manualAttempted = signal(false);

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
  protected readonly books = toSignal(this.learningService.books().pipe(catchError(() => of([]))), {
    initialValue: [],
  });

  /** What the time is for — shared by the timer and the hand-entered form. */
  protected readonly subjectForm = this.fb.group({
    topic: this.fb.nonNullable.control('', Validators.maxLength(200)),
    kind: this.fb.control<SubjectKind | null>(null),
    itemId: this.fb.control<number | null>(null),
  });
  protected readonly manualForm = this.fb.group({
    studiedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    minutes: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(1440),
    ]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  private readonly subjectValue = toSignal(this.subjectForm.valueChanges, {
    initialValue: this.subjectForm.value,
  });
  protected readonly subject = computed<StudySubject>(() => {
    const v = this.subjectValue();
    const id = v.itemId ?? null;
    return {
      topic: v.topic?.trim() || null,
      skillId: v.kind === 'Skill' ? id : null,
      courseId: v.kind === 'Course' ? id : null,
      bookId: v.kind === 'Book' ? id : null,
    };
  });
  protected readonly itemOptions = computed(() => {
    switch (this.subjectValue().kind) {
      case 'Skill':
        return this.skills().map((s) => ({ id: s.id, title: s.name }));
      case 'Course':
        return this.courses().map((c) => ({ id: c.id, title: c.title }));
      case 'Book':
        return this.books().map((b) => ({ id: b.id, title: b.title }));
      default:
        return [];
    }
  });

  constructor() {
    this.subjectForm.controls.kind.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.subjectForm.controls.itemId.setValue(null));
    this.load();
  }

  protected load(): void {
    const today = todayIso();
    this.today.set(today);
    this.learningService
      .studySessions(addDaysIso(today, -(LOG_DAYS - 1)), today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) => {
          // A reload after a change: the chart reads again too (its own first read needs no nudge).
          if (this.sessions() !== null) {
            this.version.update((v) => v + 1);
          }
          this.sessions.set(sessions);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected subjectError(): string | null {
    const s = this.subject();
    if (!this.manualAttempted()) {
      return null;
    }
    if (
      this.subjectForm.controls.kind.value &&
      s.skillId === null &&
      s.courseId === null &&
      s.bookId === null
    ) {
      return 'Choose which one, or leave it as just a topic.';
    }
    return s.topic || s.skillId || s.courseId || s.bookId
      ? null
      : 'Say what you studied: a topic, or a skill, course or book.';
  }

  protected manualError(name: 'studiedOn' | 'minutes' | 'notes'): string | null {
    const control = this.manualForm.controls[name];
    if (!(control.touched || this.manualAttempted())) {
      return null;
    }
    if (name === 'studiedOn') {
      return control.errors?.['required'] ? 'Which day?' : dateFieldError(control.errors);
    }
    if (name === 'minutes') {
      return control.errors ? 'Enter 1 to 1440 minutes.' : null;
    }
    return control.errors ? 'Keep the notes under 2000 characters.' : null;
  }

  protected logManual(): void {
    this.manualAttempted.set(true);
    this.manualForm.markAllAsTouched();
    if (this.manualForm.invalid || this.subjectForm.invalid || this.subjectError()) {
      return;
    }
    const v = this.manualForm.getRawValue();
    const subject = this.subject();
    this.saving.set(true);
    this.learningService
      .saveStudySession(null, {
        studiedOn: v.studiedOn!,
        minutes: v.minutes!,
        topic: subject.topic,
        skillId: subject.skillId,
        courseId: subject.courseId,
        bookId: subject.bookId,
        startedAt: null,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (session) => {
          this.saving.set(false);
          this.manualAttempted.set(false);
          this.manualForm.reset({ studiedOn: todayIso(), minutes: null, notes: '' });
          this.toast.success(`${formatMinutes(session.minutes)} logged.`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not log the session.'));
        },
      });
  }

  protected async remove(session: StudySession): Promise<void> {
    const confirmed = await Swal.fire({
      title: 'Remove this session?',
      text: `${formatMinutes(session.minutes)} of ${sessionSubject(session)}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeStudySession(session.id).subscribe({
      next: () => this.load(),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the session.')),
    });
  }
}
