import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import {
  GoalDetail,
  GoalMeasureEntry,
  GoalSource,
  GoalsService,
} from '../../core/services/goals.service';
import { HealthService } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { formatAmount, measureLine } from './goal-measure';
import { GoalSourcePicker } from './goal-source-picker';

/**
 * The goal page's Progress card: the one headline % (the API's GoalProgress — milestones, a number, money saved or a
 * body target) and, for a goal measured by a number, its log — added to by hand (Manual), or counted from other items
 * and read-only (Linked). Emits `changed` after anything that moves the figure, so the page re-reads the goal.
 */
@Component({
  selector: 'app-goal-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, NgbInputDatepicker, GoalSourcePicker],
  templateUrl: './goal-progress.html',
})
export class GoalProgressCard {
  private readonly goalsService = inject(GoalsService);
  private readonly toast = inject(ToastService);
  private readonly healthService = inject(HealthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly goal = input.required<GoalDetail>();
  readonly changed = output<void>();

  protected readonly formatAmount = formatAmount;
  protected readonly entries = signal<GoalMeasureEntry[]>([]);
  protected readonly sources = signal<GoalSource[]>([]);
  protected readonly editingEntryId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly picking = signal(false);

  protected readonly measured = computed(() => this.goal().measureTarget !== null);
  protected readonly linked = computed(() => this.goal().measureSource === 'Linked');

  /** "40,000 of 1,00,000 steps", "3 of 5 milestones done", … — what the % is of. */
  protected readonly summary = computed(() => {
    const goal = this.goal();
    switch (goal.progressKind) {
      case 'Measure':
        return measureLine(goal.measureCurrent, goal.measureTarget!, goal.measureUnit!);
      case 'Savings':
        return 'Money saved, from the accounts and investments linked to it';
      case 'Body':
        return goal.progressLocked
          ? 'A body measurement — unlock the vault on the Health target card to see it'
          : 'A body measurement — see the Health target';
      default:
        return goal.milestoneCount === 0
          ? 'Measured by its milestones — none yet'
          : `${goal.completedMilestoneCount} of ${goal.milestoneCount} milestones done`;
    }
  });

  protected readonly entryForm = this.fb.group({
    entryDate: this.fb.control<string | null>(todayIso(), Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
    note: this.fb.nonNullable.control('', Validators.maxLength(200)),
  });

  constructor() {
    // Re-read the log and sources whenever the goal's measure (or its figure) changes.
    effect(() => {
      const goal = this.goal();
      const key = `${goal.id}|${goal.measureSource}|${goal.measureCurrent}`;
      untracked(() => this.load(goal, key));
    });
  }

  private loadedKey = '';

  private load(goal: GoalDetail, key: string): void {
    if (key === this.loadedKey || goal.measureTarget === null) {
      return;
    }
    this.loadedKey = key;
    this.goalsService
      .entries(goal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => this.entries.set(entries),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load the log.')),
      });
    if (goal.measureSource === 'Linked') {
      this.goalsService
        .sources(goal.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (sources) => this.sources.set(sources),
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load what it counts.')),
        });
    } else {
      this.sources.set([]);
    }
  }

  protected entryError(name: 'entryDate' | 'value' | 'note'): string | null {
    const control = this.entryForm.controls[name];
    if (!control.errors || (!this.attempted() && !control.touched)) {
      return null;
    }
    if (name === 'entryDate') {
      return control.errors['required'] ? 'Choose the day.' : dateFieldError(control.errors);
    }
    if (name === 'value') {
      return 'Log an amount more than zero.';
    }
    return 'Keep the note under 200 characters.';
  }

  protected saveEntry(): void {
    this.attempted.set(true);
    if (this.entryForm.invalid) {
      this.entryForm.markAllAsTouched();
      return;
    }
    const goal = this.goal();
    const value = this.entryForm.getRawValue();
    const payload = {
      entryDate: value.entryDate!,
      value: value.value!,
      note: value.note.trim() || null,
    };
    const editing = this.editingEntryId();
    const request = editing
      ? this.goalsService.updateEntry(goal.id, editing, payload)
      : this.goalsService.addEntry(goal.id, payload);
    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the entry.'));
      },
    });
  }

  protected editEntry(entry: GoalMeasureEntry): void {
    this.editingEntryId.set(entry.id);
    this.entryForm.setValue({
      entryDate: entry.entryDate,
      value: entry.value,
      note: entry.note ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingEntryId.set(null);
    this.attempted.set(false);
    this.entryForm.reset({ entryDate: todayIso(), value: null, note: '' });
  }

  protected async removeEntry(entry: GoalMeasureEntry): Promise<void> {
    const result = await Swal.fire({
      title: 'Remove this entry?',
      text: `${formatAmount(entry.value)} ${this.goal().measureUnit} comes off the total.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }
    this.goalsService
      .removeEntry(this.goal().id, entry.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.refresh(),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the entry.')),
      });
  }

  protected async removeSource(source: GoalSource): Promise<void> {
    // What it counted is kept as a Carried over entry, so it has to be read first.
    if (source.locked) {
      this.unlock();
      return;
    }
    const counted =
      source.counted === null
        ? ''
        : ` — the ${formatAmount(source.counted)} ${source.unit} it counted stays`;
    const result = await Swal.fire({
      title: `Stop counting ${source.title}?`,
      text: `It stops adding to the goal${counted}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Stop counting',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!result.isConfirmed) {
      return;
    }
    this.goalsService
      .removeSource(this.goal().id, source.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.refresh(),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove it.')),
      });
  }

  /** Counted from workouts: the figure shows only once the vault is open (asked for here, never on page open). */
  protected unlock(): void {
    void this.healthService.unlock().then((ok) => {
      if (ok) {
        this.refresh();
      }
    });
  }

  protected sourceAdded(): void {
    this.picking.set(false);
    this.refresh();
  }

  /** The figure may have moved: re-read the log and sources with the goal, even if the total stayed the same. */
  private refresh(): void {
    this.loadedKey = '';
    this.changed.emit();
  }
}
