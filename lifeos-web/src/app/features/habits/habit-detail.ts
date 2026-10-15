import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { GOAL_ENTITY_TYPE } from '../../core/services/goals.service';
import { HABIT_ENTITY_TYPE, Habit, HabitsService } from '../../core/services/habits.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { HabitDay } from './habit-day';
import { openHabitEditor } from './habit-editor';
import {
  WEEKDAY_NAMES,
  applyEntry,
  dayState,
  daysEnding,
  isoWeekdayIndex,
  scheduleLabel,
} from './habit-schedule';
import { apiErrorMessage } from '../../core/services/api-error';

/** How many weeks of history the detail page shows, Monday-aligned, ending with this week. */
const HISTORY_WEEKS = 12;

@Component({
  selector: 'app-habit-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, HabitDay, LinkedItems, EntityReminders],
  templateUrl: './habit-detail.html',
})
export class HabitDetail implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly habitEntityType = HABIT_ENTITY_TYPE;
  protected readonly goalEntityType = GOAL_ENTITY_TYPE;
  protected readonly scheduleLabel = scheduleLabel;
  protected readonly weekdayNames = WEEKDAY_NAMES;

  protected readonly habit = signal<Habit | null>(null);
  protected readonly today = signal(todayIso());
  protected readonly busyDay = signal<string | null>(null);
  protected readonly changingStatus = signal(false);

  /** Monday of the week HISTORY_WEEKS - 1 weeks before this one. */
  private readonly historyStart = computed(() => {
    const thisMonday = addDaysIso(this.today(), -isoWeekdayIndex(this.today()));
    return addDaysIso(thisMonday, -7 * (HISTORY_WEEKS - 1));
  });

  /** Week columns, each Monday to Sunday; days after today render as "future". */
  protected readonly weeks = computed(() => {
    const habit = this.habit();
    if (!habit) {
      return [];
    }
    const done = new Set(habit.doneDates);
    const lastDay = addDaysIso(this.historyStart(), 7 * HISTORY_WEEKS - 1);
    const days = daysEnding(lastDay, 7 * HISTORY_WEEKS).map((day) => ({
      day,
      state: dayState(habit.scheduleDays, habit.startDate, done, day, this.today()),
    }));
    return Array.from({ length: HISTORY_WEEKS }, (_, week) => ({
      monday: days[week * 7].day,
      days: days.slice(week * 7, week * 7 + 7),
    }));
  });

  protected readonly doneInHistory = computed(() => this.habit()?.doneDates.length ?? 0);

  private get habitId(): number {
    return Number(this.id());
  }

  ngOnInit(): void {
    this.reload();
  }

  protected toggle(day: string): void {
    const habit = this.habit();
    if (!habit) {
      return;
    }

    this.busyDay.set(day);
    this.habitsService
      .setEntry(habit.id, day, !habit.doneDates.includes(day), this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busyDay.set(null);
          this.habit.update((current) => (current ? applyEntry(current, result) : current));
        },
        error: (err) => {
          this.busyDay.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the habit.'));
        },
      });
  }

  protected async edit(): Promise<void> {
    const habit = this.habit();
    if (habit && (await openHabitEditor(this.modal, habit))) {
      this.toast.success('Habit saved.');
      // A new schedule or start date changes the streak and which days count: re-read the whole window.
      this.reload();
    }
  }

  protected setArchived(habit: Habit, archived: boolean): void {
    this.changingStatus.set(true);
    this.habitsService
      .setStatus(habit.id, archived ? 'Archived' : 'Active', this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.changingStatus.set(false);
          // The response only carries the last week of done days; keep the 12 weeks already shown.
          this.habit.update((current) =>
            current ? { ...updated, doneDates: current.doneDates } : updated,
          );
          this.toast.success(archived ? 'Habit archived.' : 'Habit restored.');
        },
        error: (err) => {
          this.changingStatus.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not change the status.'));
        },
      });
  }

  protected async remove(habit: Habit): Promise<void> {
    const result = await Swal.fire({
      title: `Delete "${habit.title}"?`,
      text: 'Its ticked days, links and reminders go with it. Archive it instead to keep the history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete habit',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.habitsService
      .remove(habit.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Habit deleted.');
          void this.router.navigate(['/habits']);
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the habit.')),
      });
  }

  private reload(): void {
    this.today.set(todayIso());
    this.habitsService
      .get(this.habitId, this.today(), this.historyStart())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (habit) => this.habit.set(habit),
        error: (err) => {
          this.toast.error(apiErrorMessage(err, 'Habit not found.'));
          void this.router.navigate(['/habits']);
        },
      });
  }
}
