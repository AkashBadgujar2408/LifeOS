import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
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
import { GOAL_ENTITY_TYPE } from '../../core/services/goals.service';
import { Project, ProjectsService } from '../../core/services/projects.service';
import {
  RECURRENCE_FREQUENCIES,
  RecurrenceFrequency,
  TASK_ENTITY_TYPE,
  TASK_PRIORITIES,
  TaskItem,
  TaskPayload,
  TaskPriority,
  TaskRef,
  TasksService,
} from '../../core/services/tasks.service';
import { FocusTimer } from './focus-timer';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { Attachments } from '../../shared/components/attachments/attachments';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { apiErrorMessage } from '../../core/services/api-error';

export interface TaskEditorOptions {
  /** Edit this task; omit to create one. */
  task?: TaskItem;
  /** Create the task from this Inbox item (its links carry over and it gets marked processed). */
  inboxItemId?: number;
  /** Starting values for a new task. */
  defaults?: Partial<Pick<TaskPayload, 'title' | 'notes' | 'dueDate' | 'projectId'>>;
}

export type TaskEditorResult = { kind: 'saved'; task: TaskItem } | { kind: 'deleted'; id: number };

const FREQUENCY_LABELS: Record<RecurrenceFrequency, [string, string]> = {
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Yearly: ['year', 'years'],
};

/** Opens the editor; resolves with what happened, or null if it was dismissed. */
export async function openTaskEditor(
  modal: NgbModal,
  options: TaskEditorOptions = {},
): Promise<TaskEditorResult | null> {
  const modalRef = modal.open(TaskEditor, { ariaLabelledBy: 'task-editor-heading', size: 'lg' });
  (modalRef.componentInstance as TaskEditor).configure(options);
  try {
    return (await modalRef.result) as TaskEditorResult;
  } catch {
    return null;
  }
}

// Mirrors CK_TaskItems_Recurrence: something has to repeat *from* a date.
function repeatNeedsDueDate(group: AbstractControl): ValidationErrors | null {
  const { repeat, dueDate } = group.value as { repeat: string; dueDate: string | null };
  return repeat !== 'None' && !dueDate ? { repeatNeedsDueDate: true } : null;
}

@Component({
  selector: 'app-task-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    FocusTimer,
    NgbInputDatepicker,
    TagPicker,
    LinkedItems,
    EntityReminders,
    Attachments,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './task-editor.html',
})
export class TaskEditor {
  private readonly fb = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly frequencies = RECURRENCE_FREQUENCIES;
  protected readonly taskEntityType = TASK_ENTITY_TYPE;
  protected readonly goalEntityType = GOAL_ENTITY_TYPE;

  private readonly projects = toSignal(
    inject(ProjectsService)
      .list()
      .pipe(catchError(() => of<Project[]>([]))),
    { initialValue: [] },
  );

  /** Active projects, plus the one the task is already in even if that's since been completed/archived. */
  protected readonly projectOptions = computed(() => {
    const currentId = this.task()?.projectId;
    return this.projects().filter((p) => p.status === 'Active' || p.id === currentId);
  });

  protected readonly task = signal<TaskItem | null>(null);
  protected readonly inboxItemId = signal<number | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly estimatePresets = [15, 30, 60, 120] as const;
  /** What this task waits for (kept in the order added). */
  protected readonly blockers = signal<TaskRef[]>([]);
  protected readonly blockerSearch = signal('');
  /** Open tasks it could wait for: loaded once, filtered by the search box. */
  private readonly openTasks = toSignal(
    this.tasksService.list('Open').pipe(catchError(() => of<TaskItem[]>([]))),
    { initialValue: [] },
  );
  protected readonly blockerCandidates = computed(() => {
    const term = this.blockerSearch().trim().toLowerCase();
    const chosen = new Set(this.blockers().map((b) => b.id));
    const self = this.task()?.id;
    return this.openTasks()
      .filter((t) => t.id !== self && !chosen.has(t.id))
      .filter((t) => !term || t.title.toLowerCase().includes(term))
      .slice(0, 6);
  });

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(300)]),
      notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
      dueDate: this.fb.control<string | null>(null),
      priority: this.fb.nonNullable.control<TaskPriority>('None'),
      projectId: this.fb.control<number | null>(null),
      repeat: this.fb.nonNullable.control<RecurrenceFrequency | 'None'>('None'),
      interval: this.fb.nonNullable.control(1, [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
      ]),
      estimateMinutes: this.fb.control<number | null>(null, [
        Validators.min(1),
        Validators.max(10080),
      ]),
    },
    { validators: repeatNeedsDueDate },
  );

  configure(options: TaskEditorOptions): void {
    const { task, inboxItemId, defaults } = options;
    this.task.set(task ?? null);
    this.inboxItemId.set(inboxItemId ?? null);
    this.form.reset({
      title: task?.title ?? defaults?.title ?? '',
      notes: task?.notes ?? defaults?.notes ?? '',
      dueDate: task ? task.dueDate : (defaults?.dueDate ?? null),
      priority: task?.priority ?? 'None',
      projectId: task ? task.projectId : (defaults?.projectId ?? null),
      repeat: task?.recurrence?.frequency ?? 'None',
      interval: task?.recurrence?.interval ?? 1,
      estimateMinutes: task?.estimateMinutes ?? null,
    });
    this.tagIds.set(task?.tags.map((t) => t.id) ?? []);
    this.blockers.set(task?.blockedBy ?? []);
  }

  protected setEstimate(minutes: number): void {
    this.form.controls.estimateMinutes.setValue(minutes);
    this.form.controls.estimateMinutes.markAsTouched();
  }

  protected addBlocker(candidate: TaskItem): void {
    this.blockers.update((list) => [
      ...list,
      { id: candidate.id, title: candidate.title, status: candidate.status },
    ]);
    this.blockerSearch.set('');
  }

  protected removeBlocker(id: number): void {
    this.blockers.update((list) => list.filter((b) => b.id !== id));
  }

  /** Closing without saving still hands back the task when focus time was logged, so lists show the new time. */
  protected close(): void {
    const task = this.task();
    if (this.focusChanged && task) {
      this.activeModal.close({ kind: 'saved', task } as TaskEditorResult);
    } else {
      this.activeModal.dismiss();
    }
  }

  private focusChanged = false;

  /** A logged or removed focus session: the task's actual time changed. */
  protected onFocusChanged(updated: TaskItem): void {
    this.focusChanged = true;
    this.task.update((current) =>
      current ? { ...current, actualMinutes: updated.actualMinutes } : current,
    );
  }

  protected intervalUnit(): string {
    const { repeat, interval } = this.form.getRawValue();
    if (repeat === 'None') {
      return '';
    }
    const [one, many] = FREQUENCY_LABELS[repeat];
    return interval === 1 ? one : many;
  }

  protected heading(): string {
    if (this.task()) {
      return 'Edit task';
    }
    return this.inboxItemId() ? 'Make it a task' : 'New task';
  }

  protected fieldError(
    name: 'title' | 'notes' | 'dueDate' | 'interval' | 'estimateMinutes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }

    if (name === 'estimateMinutes') {
      return control.errors ? 'An estimate is 1 minute to 7 days (10,080 minutes).' : null;
    }

    if (name === 'dueDate') {
      return (
        dateFieldError(control.errors) ??
        (this.form.errors?.['repeatNeedsDueDate'] ? 'A repeating task needs a due date.' : null)
      );
    }

    const errors = control.errors;
    if (!errors) {
      return null;
    }

    if (name === 'interval') {
      return 'Repeat every 1 to 999.';
    }

    if (errors['required']) {
      return 'Give the task a title.';
    }

    if (errors['maxlength']) {
      return name === 'title'
        ? 'Keep the title under 300 characters.'
        : 'Keep the notes under 4000 characters.';
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

    const value = this.form.getRawValue();
    const payload: TaskPayload = {
      title: value.title,
      notes: value.notes.trim() || null,
      dueDate: value.dueDate || null,
      priority: value.priority,
      projectId: value.projectId,
      recurrence:
        value.repeat === 'None' ? null : { frequency: value.repeat, interval: value.interval },
      tagIds: this.tagIds(),
      estimateMinutes: value.estimateMinutes || null,
      blockedByTaskIds: this.blockers().map((b) => b.id),
    };

    const task = this.task();
    const inboxItemId = this.inboxItemId();
    const request = task
      ? this.tasksService.update(task.id, payload)
      : inboxItemId
        ? this.tasksService.createFromInbox(inboxItemId, payload)
        : this.tasksService.create(payload);

    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.activeModal.close({ kind: 'saved', task: saved } as TaskEditorResult),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the task.'));
      },
    });
  }

  protected async remove(): Promise<void> {
    const task = this.task();
    if (!task) {
      return;
    }

    const result = await Swal.fire({
      title: `Delete "${task.title}"?`,
      text: task.recurrence
        ? 'Only this occurrence is deleted; the series stops here.'
        : 'Its links go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete task',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.tasksService.remove(task.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted', id: task.id } as TaskEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the task.')),
    });
  }
}
