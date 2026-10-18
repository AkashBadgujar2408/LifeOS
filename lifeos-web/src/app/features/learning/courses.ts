import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { COURSE_STATUSES, Course, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openCourseEditor } from './course-editor';
import { COURSE_STATUS_LABELS, groupByStatus } from './learning-view';

/** Courses by status: under way first, then planned, completed and dropped. Each opens in its editor. */
@Component({
  selector: 'app-courses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  templateUrl: './courses.html',
})
export class Courses {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = COURSE_STATUS_LABELS;
  protected readonly courses = signal<Course[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() => groupByStatus(this.courses() ?? [], COURSE_STATUSES));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.learningService
      .courses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (courses) => {
          this.courses.set(courses);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(course?: Course): Promise<void> {
    const result = await openCourseEditor(this.modal, course);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Course saved.' : 'Course deleted.');
      this.load();
    }
  }
}
