import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import { GoalsService } from '../../core/services/goals.service';
import {
  LearningService,
  ROADMAP_ENTITY_TYPE,
  RoadmapDetail as RoadmapDetailModel,
  RoadmapStep,
  RoadmapStepTarget,
} from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { CountsToward } from '../../shared/components/counts-toward/counts-toward';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openCourseEditor } from './course-editor';
import { ROADMAP_STATUS_LABELS } from './learning-plan-view';
import { BOOK_STATUS_LABELS, COURSE_STATUS_LABELS } from './learning-view';
import { openRoadmapEditor } from './roadmap-editor';

/** Statuses a step's target can be in, as words (courses, books and goals each have their own). */
const TARGET_STATUS_LABELS: Record<string, string> = {
  ...COURSE_STATUS_LABELS,
  ...BOOK_STATUS_LABELS,
  Active: 'Active',
  Postponed: 'Postponed',
  Abandoned: 'Abandoned',
};

/**
 * One roadmap: its steps in order (tick, reorder, edit, remove), each optionally a course, book or goal shown with
 * that item's own status. Ticking the last open step finishes the roadmap; unticking one reopens it.
 */
@Component({
  selector: 'app-roadmap-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    LinkedItems,
    CountsToward,
    EntityReminders,
    LoadError,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './roadmap-detail.html',
})
export class RoadmapDetail {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly roadmapEntityType = ROADMAP_ENTITY_TYPE;
  protected readonly statusLabels = ROADMAP_STATUS_LABELS;
  protected readonly targetStatusLabels = TARGET_STATUS_LABELS;
  protected readonly roadmap = signal<RoadmapDetailModel | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly busyStepId = signal<number | null>(null);
  protected readonly editingStepId = signal<number | null>(null);
  protected readonly stepAttempted = signal(false);
  protected readonly savingStep = signal(false);
  private readonly titled = itemTitle(() => this.roadmap()?.title);

  // What a step can point at (lists load once; a failure just leaves the list empty).
  protected readonly courses = toSignal(
    this.learningService.courses().pipe(catchError(() => of([]))),
    {
      initialValue: [],
    },
  );
  protected readonly books = toSignal(this.learningService.books().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly goals = toSignal(
    inject(GoalsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly stepForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    targetType: this.fb.control<RoadmapStepTarget | null>(null),
    targetId: this.fb.control<number | null>(null),
  });
  private readonly targetType = toSignal(this.stepForm.controls.targetType.valueChanges, {
    initialValue: null,
  });
  /** The items to choose from for the chosen kind of target. */
  protected readonly targetOptions = computed(() => {
    switch (this.targetType()) {
      case 'Course':
        return this.courses().map((c) => ({ id: c.id, title: c.title }));
      case 'Book':
        return this.books().map((b) => ({ id: b.id, title: b.title }));
      case 'Goal':
        return this.goals().map((g) => ({ id: g.id, title: g.title }));
      default:
        return [];
    }
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
    // A new kind of target clears the chosen item; picking a target with an empty title borrows its name.
    this.stepForm.controls.targetType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.stepForm.controls.targetId.setValue(null));
    this.stepForm.controls.targetId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const title = this.stepForm.controls.title;
      const chosen = this.targetOptions().find((o) => o.id === id);
      if (chosen && !title.value.trim()) {
        title.setValue(chosen.title);
      }
    });
  }

  protected load(): void {
    this.learningService
      .roadmap(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roadmap) => {
          this.roadmap.set(roadmap);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected stepError(name: 'title' | 'targetId'): string | null {
    const control = this.stepForm.controls[name];
    if (!this.stepAttempted() && !control.touched) {
      return null;
    }
    if (name === 'targetId') {
      return this.stepForm.controls.targetType.value && control.value === null
        ? 'Choose which one, or point at nothing.'
        : null;
    }
    if (control.errors?.['required']) {
      return 'Name the step.';
    }
    return control.errors?.['maxlength'] ? 'Keep the step under 200 characters.' : null;
  }

  protected toggle(roadmap: RoadmapDetailModel, step: RoadmapStep): void {
    this.busyStepId.set(step.id);
    this.learningService
      .setRoadmapStepCompleted(roadmap.id, step.id, step.completedAt === null)
      .subscribe({
        next: ({ roadmap: updated, statusChangedTo }) => {
          this.busyStepId.set(null);
          this.roadmap.set(updated);
          if (statusChangedTo === 'Completed') {
            this.toast.success(`Every step done — "${updated.title}" is complete.`);
          } else if (statusChangedTo === 'Active') {
            this.toast.success('Back under way.');
          }
        },
        error: (err) => {
          this.busyStepId.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the step.'));
        },
      });
  }

  protected move(roadmap: RoadmapDetailModel, step: RoadmapStep, by: -1 | 1): void {
    const ids = roadmap.steps.map((s) => s.id);
    const from = ids.indexOf(step.id);
    const to = from + by;
    if (to < 0 || to >= ids.length) {
      return;
    }
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this.learningService.reorderRoadmapSteps(roadmap.id, ids).subscribe({
      next: (updated) => this.roadmap.set(updated),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not move the step.')),
    });
  }

  protected editStep(step: RoadmapStep): void {
    this.editingStepId.set(step.id);
    this.stepAttempted.set(false);
    this.stepForm.reset({ title: step.title, targetType: step.targetType, targetId: null });
    // Set after the type (whose change clears the item).
    this.stepForm.controls.targetId.setValue(step.targetId, { emitEvent: false });
  }

  protected cancelStep(): void {
    this.editingStepId.set(null);
    this.stepAttempted.set(false);
    this.stepForm.reset({ title: '', targetType: null, targetId: null });
  }

  protected saveStep(roadmap: RoadmapDetailModel): void {
    const title = this.stepForm.controls.title;
    title.setValue(title.value.trim());
    this.stepAttempted.set(true);
    if (this.stepForm.invalid || this.stepError('targetId')) {
      return;
    }
    const v = this.stepForm.getRawValue();
    this.savingStep.set(true);
    this.learningService
      .saveRoadmapStep(roadmap.id, this.editingStepId(), {
        title: v.title,
        targetType: v.targetType,
        targetId: v.targetType ? v.targetId : null,
      })
      .subscribe({
        next: (updated) => {
          this.savingStep.set(false);
          this.roadmap.set(updated);
          this.cancelStep();
        },
        error: (err) => {
          this.savingStep.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the step.'));
        },
      });
  }

  protected async removeStep(roadmap: RoadmapDetailModel, step: RoadmapStep): Promise<void> {
    const confirmed = await Swal.fire({
      title: 'Remove this step?',
      text: `"${step.title}" leaves the roadmap. A course, book or goal it pointed at stays.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeRoadmapStep(roadmap.id, step.id).subscribe({
      next: (updated) => {
        if (this.editingStepId() === step.id) {
          this.cancelStep();
        }
        this.roadmap.set(updated);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the step.')),
    });
  }

  protected openTarget(step: RoadmapStep): void {
    if (step.targetId === null) {
      return;
    }
    switch (step.targetType) {
      case 'Book':
        void this.router.navigate(['/learning/books', step.targetId]);
        break;
      case 'Goal':
        void this.router.navigate(['/goals', step.targetId]);
        break;
      case 'Course':
        this.learningService.course(step.targetId).subscribe({
          next: async (course) => {
            const result = await openCourseEditor(this.modal, course);
            if (result) {
              this.toast.success(result.kind === 'saved' ? 'Course saved.' : 'Course deleted.');
              this.load();
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the course.')),
        });
        break;
    }
  }

  protected async edit(roadmap: RoadmapDetailModel): Promise<void> {
    const saved = await openRoadmapEditor(this.modal, roadmap);
    if (saved) {
      this.roadmap.set(saved);
      this.toast.success('Roadmap saved.');
    }
  }

  protected async remove(roadmap: RoadmapDetailModel): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete "${roadmap.title}"?`,
      text: 'Its steps go with it. Courses, books and goals they pointed at stay.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeRoadmap(roadmap.id).subscribe({
      next: () => {
        this.toast.success('Roadmap deleted.');
        void this.router.navigate(['/learning/roadmaps']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the roadmap.')),
    });
  }
}
