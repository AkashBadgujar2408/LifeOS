import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  TasksService,
} from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';

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
  imports: [ReactiveFormsModule, NgbInputDatepicker, TagPicker, LinkedItems],
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
    });
    this.tagIds.set(task?.tags.map((t) => t.id) ?? []);
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

  protected fieldError(name: 'title' | 'notes' | 'dueDate' | 'interval'): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
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
        this.toast.error(err.error?.message ?? 'Could not save the task.');
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
      error: (err) => this.toast.error(err.error?.message ?? 'Could not delete the task.'),
    });
  }
}
