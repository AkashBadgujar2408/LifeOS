import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, formatDate } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { GOAL_ENTITY_TYPE } from '../../core/services/goals.service';
import {
  PROJECT_ENTITY_TYPE,
  Project,
  ProjectStatus,
  ProjectsService,
} from '../../core/services/projects.service';
import { TaskItem, TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { openTaskEditor } from '../tasks/task-editor';
import { TaskRow } from '../tasks/task-row';
import { sortTasks } from '../tasks/task-views';
import { openProjectEditor } from './project-editor';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';

interface StatusAction {
  status: ProjectStatus;
  label: string;
  icon: string;
  primary?: boolean;
}

const STATUS_META: Record<ProjectStatus, { label: string; icon: string; tone: string }> = {
  Active: { label: 'Active', icon: 'bi-play-circle', tone: 'text-primary' },
  Completed: { label: 'Completed', icon: 'bi-check-circle-fill', tone: 'text-success' },
  Archived: { label: 'Archived', icon: 'bi-archive', tone: 'text-body-secondary' },
};

const STATUS_ACTIONS: Record<ProjectStatus, StatusAction[]> = {
  Active: [
    { status: 'Completed', label: 'Mark completed', icon: 'bi-check-circle', primary: true },
    { status: 'Archived', label: 'Archive', icon: 'bi-archive' },
  ],
  Completed: [
    { status: 'Active', label: 'Reopen', icon: 'bi-arrow-counterclockwise' },
    { status: 'Archived', label: 'Archive', icon: 'bi-archive' },
  ],
  Archived: [{ status: 'Active', label: 'Reopen', icon: 'bi-arrow-counterclockwise' }],
};

@Component({
  selector: 'app-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, LinkedItems, EntityReminders, TaskRow],
  templateUrl: './project-detail.html',
})
export class ProjectDetail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projectsService = inject(ProjectsService);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly projectEntityType = PROJECT_ENTITY_TYPE;
  protected readonly goalEntityType = GOAL_ENTITY_TYPE;
  protected readonly statusMeta = STATUS_META;
  protected readonly statusActions = STATUS_ACTIONS;
  protected readonly today = todayIso();

  protected readonly project = signal<Project | null>(null);
  private readonly titled = itemTitle(() => this.project()?.name);
  protected readonly openTasks = signal<TaskItem[]>([]);
  protected readonly doneTasks = signal<TaskItem[]>([]);
  protected readonly showDone = signal(false);
  protected readonly busyId = signal<number | null>(null);
  protected readonly changingStatus = signal(false);

  /** Soonest first, undated last: inside one project, "what's next" matters more than priority. */
  protected readonly sortedOpenTasks = computed(() => sortTasks(this.openTasks(), 'dueDate'));

  protected readonly quickAddForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
  });
  protected readonly quickAdding = signal(false);
  protected readonly quickAddAttempted = signal(false);

  private get projectId(): number {
    return Number(this.id());
  }

  ngOnInit(): void {
    this.reload();
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
        dueDate: null,
        priority: 'None',
        projectId: this.projectId,
        recurrence: null,
        tagIds: [],
        estimateMinutes: null,
        blockedByTaskIds: [],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.quickAdding.set(false);
          this.quickAddAttempted.set(false);
          this.quickAddForm.reset();
          this.reload();
        },
        error: (err) => {
          this.quickAdding.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not add the task.'));
        },
      });
  }

  protected async newTask(): Promise<void> {
    const result = await openTaskEditor(this.modal, { defaults: { projectId: this.projectId } });
    if (result?.kind === 'saved') {
      this.toast.success('Task added.');
      this.reload();
    }
  }

  protected async editTask(task: TaskItem): Promise<void> {
    const result = await openTaskEditor(this.modal, { task });
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
    }
    // Reload even when dismissed: links added in the editor apply immediately.
    this.reload();
  }

  protected toggleTask(task: TaskItem): void {
    const completing = task.status === 'Open';
    this.busyId.set(task.id);
    this.tasksService
      .setCompleted(task.id, completing, this.today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ nextOccurrence }) => {
          this.busyId.set(null);
          if (nextOccurrence?.dueDate) {
            this.toast.success(
              `Done. Next one is due ${formatDate(nextOccurrence.dueDate, APP_DATE_FORMAT, this.locale)}.`,
            );
          }
          this.reload();
        },
        error: (err) => {
          this.busyId.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the task.'));
        },
      });
  }

  protected async edit(project: Project): Promise<void> {
    const saved = await openProjectEditor(this.modal, project);
    if (saved) {
      this.project.set(saved);
      this.toast.success('Project saved.');
    }
  }

  protected async changeStatus(project: Project, action: StatusAction): Promise<void> {
    if (action.status === 'Completed' && project.openTaskCount > 0) {
      const result = await Swal.fire({
        title: 'Mark it completed?',
        text: `It still has ${project.openTaskCount} open task${project.openTaskCount === 1 ? '' : 's'}. They stay on your task list.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Mark completed',
      });
      if (!result.isConfirmed) {
        return;
      }
    }

    this.changingStatus.set(true);
    this.projectsService
      .setStatus(project.id, action.status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.changingStatus.set(false);
          this.project.set(updated);
          this.toast.success(
            action.status === 'Active'
              ? 'Project reopened.'
              : `Project ${action.status.toLowerCase()}.`,
          );
        },
        error: (err) => {
          this.changingStatus.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not change the status.'));
        },
      });
  }

  protected async remove(project: Project): Promise<void> {
    const taskCount = project.openTaskCount + project.doneTaskCount;
    const result = await Swal.fire({
      title: `Delete "${project.name}"?`,
      text:
        taskCount > 0
          ? `Its ${taskCount} task${taskCount === 1 ? '' : 's'} stay, just without a project. Its links go with it.`
          : 'Its links go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete project',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.projectsService
      .remove(project.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Project deleted.');
          void this.router.navigate(['/projects']);
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the project.')),
      });
  }

  private reload(): void {
    forkJoin({
      project: this.projectsService.get(this.projectId),
      open: this.tasksService.list('Open', this.projectId),
      done: this.tasksService.list('Done', this.projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ project, open, done }) => {
          this.project.set(project);
          this.openTasks.set(open);
          this.doneTasks.set(done);
        },
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Project not found.'));
          void this.router.navigate(['/projects']);
        },
      });
  }
}
