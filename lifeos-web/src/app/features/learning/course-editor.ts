import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  COURSE_ENTITY_TYPE,
  COURSE_STATUSES,
  Course,
  CourseStatus,
  LearningService,
  Skill,
} from '../../core/services/learning.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { CountsToward } from '../../shared/components/counts-toward/counts-toward';
import { COURSE_STATUS_LABELS } from './learning-view';

export type CourseEditorResult = { kind: 'saved'; course: Course } | { kind: 'deleted' };

/** The Learning life area, which new courses start in. */
const LEARNING_AREA_NAME = 'Learning';

/** Opens the course dialog (new when `course` is missing); resolves with what happened, or null if dismissed. */
export async function openCourseEditor(
  modal: NgbModal,
  course?: Course,
  defaults?: { skillId?: number },
): Promise<CourseEditorResult | null> {
  const modalRef = modal.open(CourseEditor, {
    ariaLabelledBy: 'course-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as CourseEditor).configure(course, defaults);
  try {
    return (await modalRef.result) as CourseEditorResult;
  } catch {
    return null;
  }
}

// Mirrors CK_Courses_Dates (the API fills in a missing start/completion day itself).
function courseRules(group: AbstractControl): ValidationErrors | null {
  const { startedOn, completedOn, status } = group.value as {
    startedOn: string | null;
    completedOn: string | null;
    status: CourseStatus;
  };
  return status === 'Completed' && startedOn && completedOn && completedOn < startedOn
    ? { completedBeforeStarted: true }
    : null;
}

@Component({
  selector: 'app-course-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    CountsToward,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './course-editor.html',
})
export class CourseEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly statuses = COURSE_STATUSES;
  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly courseEntityType = COURSE_ENTITY_TYPE;
  protected readonly minDate = { year: 1980, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly skills = signal<Skill[]>([]);

  protected readonly course = signal<Course | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      provider: this.fb.nonNullable.control('', Validators.maxLength(200)),
      url: this.fb.nonNullable.control('', Validators.maxLength(500)),
      status: this.fb.nonNullable.control<CourseStatus>('Planned'),
      progressPercent: this.fb.nonNullable.control(0, [
        Validators.required,
        Validators.min(0),
        Validators.max(100),
      ]),
      startedOn: this.fb.control<string | null>(null),
      completedOn: this.fb.control<string | null>(null),
      skillId: this.fb.control<number | null>(null),
      lifeAreaId: this.fb.control<number | null>(null),
      notes: this.fb.nonNullable.control('', Validators.maxLength(10000)),
    },
    { validators: courseRules },
  );

  constructor() {
    // A new course starts in the Learning area; the areas may arrive after the dialog opened.
    effect(() => {
      const learning = this.lifeAreas().find((a) => a.name === LEARNING_AREA_NAME);
      untracked(() => {
        const control = this.form.controls.lifeAreaId;
        if (learning && !this.course() && control.pristine && control.value === null) {
          control.setValue(learning.id);
        }
      });
    });
    this.learningService
      .skills()
      .subscribe({ next: (skills) => this.skills.set(skills), error: () => undefined });
  }

  configure(course?: Course, defaults?: { skillId?: number }): void {
    this.course.set(course ?? null);
    this.form.reset({
      title: course?.title ?? '',
      provider: course?.provider ?? '',
      url: course?.url ?? '',
      status: course?.status ?? 'Planned',
      progressPercent: course?.progressPercent ?? 0,
      startedOn: course?.startedOn ?? null,
      completedOn: course?.completedOn ?? null,
      skillId: course ? course.skillId : (defaults?.skillId ?? null),
      lifeAreaId: course
        ? course.lifeAreaId
        : (this.lifeAreas().find((a) => a.name === LEARNING_AREA_NAME)?.id ?? null),
      notes: course?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'title' | 'provider' | 'url' | 'progressPercent' | 'startedOn' | 'completedOn' | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'startedOn' || name === 'completedOn') {
      return (
        dateFieldError(control.errors) ??
        (name === 'completedOn' && this.form.errors?.['completedBeforeStarted']
          ? "It can't be completed before it started."
          : null)
      );
    }
    if (name === 'progressPercent') {
      return control.errors ? 'Progress is 0 to 100%.' : null;
    }
    if (control.errors?.['required']) {
      return 'Give the course a title.';
    }
    if (control.errors?.['maxlength']) {
      return {
        title: 'Keep the title under 200 characters.',
        provider: 'Keep the provider under 200 characters.',
        url: 'That link is too long.',
        notes: 'Keep the notes under 10,000 characters.',
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
    const completed = v.status === 'Completed';
    this.saving.set(true);
    this.learningService
      .saveCourse(this.course()?.id ?? null, {
        title: v.title,
        provider: v.provider.trim() || null,
        url: v.url.trim() || null,
        status: v.status,
        progressPercent: completed ? 100 : v.progressPercent,
        startedOn: v.startedOn,
        completedOn: completed ? v.completedOn : null,
        notes: v.notes.trim() || null,
        skillId: v.skillId,
        lifeAreaId: v.lifeAreaId,
        today: todayIso(),
      })
      .subscribe({
        next: (course) => this.activeModal.close({ kind: 'saved', course }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the course.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const course = this.course();
    if (!course) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${course.title}"?`,
      text: 'Its links and reminders go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeCourse(course.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the course.')),
    });
  }
}
