import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import {
  HABIT_STATUSES,
  Habit,
  HabitStatus,
  HabitsService,
} from '../../core/services/habits.service';
import { ToastService } from '../../core/services/toast.service';
import { HabitDay } from './habit-day';
import { openHabitEditor } from './habit-editor';
import {
  HabitDayState,
  WEEKDAY_NAMES,
  applyEntry,
  dayState,
  daysEnding,
  isScheduled,
  isoWeekdayIndex,
  scheduleLabel,
} from './habit-schedule';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';

const GRID_DAYS = 7;

interface GridRow {
  habit: Habit;
  cells: { day: string; state: HabitDayState }[];
}

@Component({
  selector: 'app-habits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, DatePipe, RouterLink, HabitDay],
  templateUrl: './habits.html',
})
export class Habits implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = HABIT_STATUSES;
  protected readonly scheduleLabel = scheduleLabel;
  protected readonly dayMonthFormat = APP_DAY_MONTH_FORMAT;

  protected readonly habits = signal<Habit[]>([]);
  protected readonly loading = signal(true);
  /** The last load failed: show the retry block, not the empty state (which would say "you have none"). */
  protected readonly loadFailed = signal(false);
  protected readonly statusFilter = signal<HabitStatus>('Active');
  protected readonly today = signal(todayIso());
  /** The last day the grid shows: today, or an earlier day when paging back through past weeks. */
  protected readonly windowEnd = signal(todayIso());
  /** "habitId:yyyy-MM-dd" of the tick in flight. */
  protected readonly busyCell = signal<string | null>(null);

  protected readonly days = computed(() => daysEnding(this.windowEnd(), GRID_DAYS));
  protected readonly dayHeaders = computed(() =>
    this.days().map((day) => ({
      day,
      weekday: WEEKDAY_NAMES[isoWeekdayIndex(day)],
      dayOfMonth: Number(day.slice(8)),
      isToday: day === this.today(),
    })),
  );
  protected readonly atToday = computed(() => this.windowEnd() >= this.today());

  protected readonly statusCounts = computed(() => {
    const counts = new Map<HabitStatus, number>();
    for (const habit of this.habits()) {
      counts.set(habit.status, (counts.get(habit.status) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly rows = computed<GridRow[]>(() =>
    this.habits()
      .filter((habit) => habit.status === this.statusFilter())
      .map((habit) => {
        const done = new Set(habit.doneDates);
        return {
          habit,
          cells: this.days().map((day) => ({
            day,
            state: dayState(habit.scheduleDays, habit.startDate, done, day, this.today()),
          })),
        };
      }),
  );

  /** "2 of 3 done today" across the active habits due today. */
  protected readonly todaySummary = computed(() => {
    const due = this.habits().filter(
      (habit) =>
        habit.status === 'Active' &&
        habit.startDate <= this.today() &&
        isScheduled(habit.scheduleDays, this.today()),
    );
    return { due: due.length, done: due.filter((habit) => habit.streak.doneToday).length };
  });

  ngOnInit(): void {
    this.reload();
  }

  protected shiftWeek(direction: -1 | 1): void {
    const next = addDaysIso(this.windowEnd(), direction * GRID_DAYS);
    this.windowEnd.set(next > this.today() ? this.today() : next);
    this.reload();
  }

  protected backToToday(): void {
    this.windowEnd.set(this.today());
    this.reload();
  }

  protected toggle(habit: Habit, day: string): void {
    const key = `${habit.id}:${day}`;
    const done = !habit.doneDates.includes(day);
    this.busyCell.set(key);
    this.habitsService
      .setEntry(habit.id, day, done, this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busyCell.set(null);
          this.habits.update((habits) =>
            habits.map((h) => (h.id === habit.id ? applyEntry(h, result) : h)),
          );
        },
        error: (err) => {
          this.busyCell.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the habit.'));
        },
      });
  }

  protected async newHabit(): Promise<void> {
    const saved = await openHabitEditor(this.modal);
    if (saved) {
      this.toast.success('Habit created.');
      this.statusFilter.set('Active');
      this.reload();
    }
  }

  protected reload(): void {
    // Picks up a new day if the page was left open past midnight.
    const today = todayIso();
    if (this.windowEnd() === this.today() || this.windowEnd() > today) {
      this.windowEnd.set(today);
    }
    this.today.set(today);

    this.habitsService
      .list(today, this.days()[0])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (habits) => {
          this.habits.set(habits);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your habits.'));
        },
      });
  }
}
