import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  afterNextRender,
  LOCALE_ID,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, formatDate } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import {
  GOAL_ENTITY_TYPE,
  GOAL_TYPE_LABELS,
  GoalDetail as GoalDetailModel,
  GoalHistoryEntry,
  GoalMilestone,
  GoalsService,
} from '../../core/services/goals.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import {
  APP_DATE_FORMAT,
  APP_DATE_TIME_FORMAT,
  dateFieldError,
} from '../../core/dates/date-format';
import {
  GOAL_STATUS_META,
  GoalStatusAction,
  goalStatusActions,
  historyTitle,
  revisionSummary,
} from './goal-status';
import { isOverdue } from './goal-dates';

const MILESTONE_TITLE_VALIDATORS = [Validators.required, Validators.maxLength(200)];

@Component({
  selector: 'app-goal-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, NgbInputDatepicker, LinkedItems],
  templateUrl: './goal-detail.html',
})
export class GoalDetail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly goalsService = inject(GoalsService);
  private readonly router = inject(Router);
  private readonly toastr = inject(ToastrService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly typeLabels = GOAL_TYPE_LABELS;
  protected readonly goalEntityType = GOAL_ENTITY_TYPE;
  protected readonly isOverdue = isOverdue;
  protected readonly statusMeta = GOAL_STATUS_META;
  protected readonly statusActions = (goal: GoalDetailModel) => goalStatusActions(goal.status);
  protected readonly historyTitle = historyTitle;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly goal = signal<GoalDetailModel | null>(null);
  protected readonly editingMilestoneId = signal<number | null>(null);
  /** Milestone currently being saved; its controls are disabled so a double click can't fire twice. */
  protected readonly busyMilestoneId = signal<number | null>(null);
  protected readonly adding = signal(false);
  protected readonly changingStatus = signal(false);
  /** The add form stays open after each save, so only nag about an empty title after a submit attempt. */
  protected readonly addAttempted = signal(false);

  protected readonly addForm = this.fb.nonNullable.group({
    title: ['', MILESTONE_TITLE_VALIDATORS],
    targetDate: this.fb.control<string | null>(null),
  });
  protected readonly editForm = this.fb.nonNullable.group({
    title: ['', MILESTONE_TITLE_VALIDATORS],
    targetDate: this.fb.control<string | null>(null),
  });

  private get goalId(): number {
    return Number(this.id());
  }

  ngOnInit(): void {
    this.reload();
  }

  protected fieldError(form: 'add' | 'edit'): string | null {
    const control = (form === 'add' ? this.addForm : this.editForm).controls.title;
    const shown = form === 'add' ? this.addAttempted() : control.touched;
    if (!shown || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return 'Enter a milestone.';
    }

    if (control.errors['maxlength']) {
      return 'Keep milestones under 200 characters.';
    }

    return null;
  }

  protected dateError(form: 'add' | 'edit'): string | null {
    const control = (form === 'add' ? this.addForm : this.editForm).controls.targetDate;
    return control.touched ? dateFieldError(control.errors) : null;
  }

  protected addMilestone(): void {
    const title = this.addForm.controls.title;
    title.setValue(title.value.trim());
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      this.addAttempted.set(true);
      return;
    }

    const value = this.addForm.getRawValue();
    this.adding.set(true);
    this.goalsService
      .addMilestone(this.goalId, { title: value.title, targetDate: value.targetDate || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.adding.set(false);
          this.addForm.reset();
          this.addAttempted.set(false);
          this.reload();
          afterNextRender(() => document.getElementById('new-milestone')?.focus(), {
            injector: this.injector,
          });
        },
        error: (err) => {
          this.adding.set(false);
          this.toastr.error(err.error?.message ?? 'Could not add the milestone.');
        },
      });
  }

  protected toggleMilestone(milestone: GoalMilestone): void {
    this.busyMilestoneId.set(milestone.id);
    this.goalsService
      .setMilestoneCompleted(this.goalId, milestone.id, !milestone.completedAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: (err) => {
          this.busyMilestoneId.set(null);
          this.toastr.error(err.error?.message ?? 'Could not update the milestone.');
        },
      });
  }

  protected startEdit(milestone: GoalMilestone): void {
    this.editingMilestoneId.set(milestone.id);
    this.editForm.reset({ title: milestone.title, targetDate: milestone.targetDate });
    afterNextRender(() => document.getElementById('edit-milestone-title')?.focus(), {
      injector: this.injector,
    });
  }

  protected cancelEdit(): void {
    this.editingMilestoneId.set(null);
  }

  protected saveEdit(milestone: GoalMilestone): void {
    const title = this.editForm.controls.title;
    title.setValue(title.value.trim());
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    this.goalsService
      .updateMilestone(this.goalId, milestone.id, {
        title: value.title,
        targetDate: value.targetDate || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editingMilestoneId.set(null);
          this.reload();
        },
        error: (err) => this.toastr.error(err.error?.message ?? 'Could not save the milestone.'),
      });
  }

  protected move(index: number, direction: -1 | 1): void {
    const milestones = [...(this.goal()?.milestones ?? [])];
    const target = index + direction;
    if (target < 0 || target >= milestones.length) {
      return;
    }

    [milestones[index], milestones[target]] = [milestones[target], milestones[index]];
    // Show the new order straight away; the reload after the save confirms it.
    this.goal.update((goal) => (goal ? { ...goal, milestones } : goal));
    this.goalsService
      .reorderMilestones(
        this.goalId,
        milestones.map((m) => m.id),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: (err) => {
          this.toastr.error(err.error?.message ?? 'Could not reorder the milestones.');
          this.reload();
        },
      });
  }

  protected async removeMilestone(milestone: GoalMilestone): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete this milestone?',
      text: `"${milestone.title}" will be removed and progress recalculated.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.goalsService
      .removeMilestone(this.goalId, milestone.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: (err) => this.toastr.error(err.error?.message ?? 'Could not delete the milestone.'),
      });
  }

  /** When the goal entered its current status: the latest status change, else when it was created. */
  protected statusSince(goal: GoalDetailModel): string {
    return goal.history.find((h) => h.eventType === 'StatusChanged')?.createdAt ?? goal.createdAt;
  }

  protected revisionSummary(entry: GoalHistoryEntry): string {
    return revisionSummary(entry, (isoDate) => formatDate(isoDate, APP_DATE_FORMAT, this.locale));
  }

  protected async changeStatus(goal: GoalDetailModel, action: GoalStatusAction): Promise<void> {
    const result = await Swal.fire({
      title: action.dialogTitle,
      text: `"${goal.title}" keeps its milestones and history either way.`,
      input: 'textarea',
      inputLabel: 'Note',
      inputPlaceholder: action.notePlaceholder,
      inputAttributes: { maxlength: '1000' },
      showCancelButton: true,
      confirmButtonText: action.label,
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!result.isConfirmed) {
      return;
    }

    const note = (result.value as string).trim() || null;
    this.changingStatus.set(true);
    this.goalsService
      .setStatus(goal.id, action.status, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.goal.set(updated);
          this.changingStatus.set(false);
          this.toastr.success(`${historyTitle(updated.history[0])}.`);
        },
        error: (err) => {
          this.changingStatus.set(false);
          this.toastr.error(err.error?.message ?? 'Could not change the status.');
        },
      });
  }

  protected async removeGoal(goal: GoalDetailModel): Promise<void> {
    const result = await Swal.fire({
      title: `Delete "${goal.title}"?`,
      text: 'Its milestones and links go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete goal',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.goalsService
      .remove(goal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastr.success(`Deleted "${goal.title}".`);
          this.router.navigate(['/goals']);
        },
        error: (err) => this.toastr.error(err.error?.message ?? 'Could not delete the goal.'),
      });
  }

  /** Progress is calculated by the API, so every milestone change re-reads the goal rather than guessing. */
  private reload(): void {
    this.goalsService
      .get(this.goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (goal) => {
          this.goal.set(goal);
          this.busyMilestoneId.set(null);
        },
        error: () => {
          this.toastr.error('That goal could not be found.');
          this.router.navigate(['/goals']);
        },
      });
  }
}
