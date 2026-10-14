import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  LOCALE_ID,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DATE_FORMAT, APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { TaskItem, TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import {
  TaskView,
  bucketTasks,
  defaultDueDateFor,
  groupByDueDate,
  recurrenceLabel,
  relativeDayLabel,
} from './task-views';
import { openTaskEditor } from './task-editor';

const VIEW_LABELS: Record<TaskView, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  someday: 'Someday',
  done: 'Done',
};

const PRIORITY_META: Record<string, { icon: string; tone: string } | undefined> = {
  High: { icon: 'bi-flag-fill', tone: 'text-danger' },
  Medium: { icon: 'bi-flag-fill', tone: 'text-warning' },
  Low: { icon: 'bi-flag', tone: 'text-body-secondary' },
};

@Component({
  selector: 'app-tasks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule],
  templateUrl: './tasks.html',
})
export class Tasks {
  private readonly fb = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly views: TaskView[] = ['today', 'upcoming', 'someday', 'done'];
  protected readonly viewLabels = VIEW_LABELS;
  protected readonly priorityMeta = PRIORITY_META;
  protected readonly recurrenceLabel = recurrenceLabel;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  /** The user's local date, fixed for the life of the page (reloading picks up a new day). */
  protected readonly today = todayIso();
  protected readonly view = signal<TaskView>('today');
  protected readonly openTasks = signal<TaskItem[]>([]);
  protected readonly doneTasks = signal<TaskItem[] | null>(null);
  protected readonly loading = signal(true);
  /** Task currently being ticked/unticked, so a double click can't fire twice. */
  protected readonly busyId = signal<number | null>(null);

  protected readonly buckets = computed(() => bucketTasks(this.openTasks(), this.today));
  protected readonly upcomingGroups = computed(() => groupByDueDate(this.buckets().upcoming));
  protected readonly counts = computed(() => {
    const b = this.buckets();
    return {
      today: b.overdue.length + b.today.length,
      overdue: b.overdue.length,
      upcoming: b.upcoming.length,
      someday: b.someday.length,
    };
  });

  protected readonly quickAddForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
  });
  protected readonly quickAdding = signal(false);
  protected readonly quickAddAttempted = signal(false);

  constructor() {
    // Reload whenever a task is created elsewhere (e.g. an Inbox item made into a task).
    effect(() => {
      this.tasksService.changedVersion();
      this.loadOpen();
    });
  }

  protected setView(view: TaskView): void {
    this.view.set(view);
    if (view === 'done' && this.doneTasks() === null) {
      this.loadDone();
    }
  }

  protected relativeDayLabel(date: string): string | null {
    return relativeDayLabel(date, this.today);
  }

  protected isOverdue(task: TaskItem): boolean {
    return task.status === 'Open' && task.dueDate !== null && task.dueDate < this.today;
  }

  protected quickAddError(): string | null {
    const control = this.quickAddForm.controls.title;
    if (!this.quickAddAttempted() || !control.errors) {
      return null;
    }
    return control.errors['required']
      ? 'Type the task first.'
      : 'Keep the title under 300 characters.';
  }

  protected quickAdd(): void {
    const control = this.quickAddForm.controls.title;
    control.setValue(control.value.trim());
    if (this.quickAddForm.invalid) {
      this.quickAddAttempted.set(true);
      return;
    }

    this.quickAdding.set(true);
    this.tasksService
      .create({
        title: control.value,
        notes: null,
        dueDate: defaultDueDateFor(this.view(), this.today),
        priority: 'None',
        projectId: null,
        recurrence: null,
        tagIds: [],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.quickAdding.set(false);
          this.quickAddAttempted.set(false);
          this.quickAddForm.reset();
          this.openTasks.update((tasks) => [...tasks, task]);
        },
        error: (err) => {
          this.quickAdding.set(false);
          this.toast.error(err.error?.message ?? 'Could not add the task.');
        },
      });
  }

  protected async newTask(): Promise<void> {
    const result = await openTaskEditor(this.modal, {
      defaults: { dueDate: defaultDueDateFor(this.view(), this.today) },
    });
    if (result?.kind === 'saved') {
      this.openTasks.update((tasks) => [...tasks, result.task]);
      this.toast.success('Task added.');
    }
  }

  protected async edit(task: TaskItem): Promise<void> {
    const result = await openTaskEditor(this.modal, { task });
    if (!result) {
      return;
    }

    const replace = (tasks: TaskItem[]) =>
      result.kind === 'saved'
        ? tasks.map((t) => (t.id === task.id ? result.task : t))
        : tasks.filter((t) => t.id !== result.id);
    this.openTasks.update(replace);
    this.doneTasks.update((tasks) => (tasks ? replace(tasks) : tasks));
    this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
  }

  protected toggle(task: TaskItem): void {
    const completing = task.status === 'Open';
    this.busyId.set(task.id);
    this.tasksService
      .setCompleted(task.id, completing, this.today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ task: updated, nextOccurrence }) => {
          this.busyId.set(null);
          if (completing) {
            this.openTasks.update((tasks) => [
              ...tasks.filter((t) => t.id !== task.id),
              ...(nextOccurrence ? [nextOccurrence] : []),
            ]);
            this.doneTasks.update((tasks) => (tasks ? [updated, ...tasks] : tasks));
            if (nextOccurrence) {
              this.toast.success(
                `Done. Next one is due ${this.formatDate(nextOccurrence.dueDate!)}.`,
              );
            }
          } else {
            this.doneTasks.update((tasks) => tasks?.filter((t) => t.id !== task.id) ?? null);
            this.openTasks.update((tasks) => [...tasks, updated]);
            this.toast.success('Moved back to open tasks.');
          }
        },
        error: (err) => {
          this.busyId.set(null);
          this.toast.error(err.error?.message ?? 'Could not update the task.');
        },
      });
  }

  private formatDate(isoDate: string): string {
    return formatDate(isoDate, APP_DATE_FORMAT, this.locale);
  }

  private loadOpen(): void {
    this.tasksService
      .list('Open')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tasks) => {
          this.openTasks.set(tasks);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load your tasks.');
        },
      });
  }

  private loadDone(): void {
    this.tasksService
      .list('Done')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tasks) => this.doneTasks.set(tasks),
        error: () => this.toast.error('Could not load completed tasks.'),
      });
  }
}
