import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
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
import { CountsToward } from '../../shared/components/counts-toward/counts-toward';
import { HabitDay } from './habit-day';
import { openHabitEditor } from './habit-editor';
import { entryChangeFor } from './habit-entry';
import { heatmapStart, weekdayConsistency, yearGrid } from './habit-analytics';
import {
  WEEKDAY_NAMES,
  applyEntry,
  habitDayState,
  formatAmount,
  targetLabel,
  daysEnding,
  isoWeekdayIndex,
  scheduleLabel,
} from './habit-schedule';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';

/** How many weeks of history the detail page shows, Monday-aligned, ending with this week. */
const HISTORY_WEEKS = 12;

@Component({
  selector: 'app-habit-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, HabitDay, LinkedItems, EntityReminders, CountsToward],
  templateUrl: './habit-detail.html',
  styleUrl: './habit-detail.scss',
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
  protected readonly targetLabel = targetLabel;
  protected readonly weekdayNames = WEEKDAY_NAMES;

  protected readonly habit = signal<Habit | null>(null);
  private readonly titled = itemTitle(() => this.habit()?.title);
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
    const lastDay = addDaysIso(this.historyStart(), 7 * HISTORY_WEEKS - 1);
    const days = daysEnding(lastDay, 7 * HISTORY_WEEKS).map((day) => ({
      day,
      state: habitDayState(habit, day, this.today()),
      amount: habit.values[day] !== undefined ? formatAmount(habit.values[day]) : null,
    }));
    return Array.from({ length: HISTORY_WEEKS }, (_, week) => ({
      monday: days[week * 7].day,
      days: days.slice(week * 7, week * 7 + 7),
    }));
  });

  protected readonly doneInHistory = computed(
    () => this.habit()?.doneDates.filter((d) => d >= this.historyStart()).length ?? 0,
  );
  protected readonly slipsInHistory = computed(
    () => this.habit()?.slipDates.filter((d) => d >= this.historyStart()).length ?? 0,
  );

  /** A year of the habit, a square a day (read-only), and how reliably each weekday goes. */
  protected readonly year = computed(() => {
    const habit = this.habit();
    return habit ? yearGrid(habit, this.today()) : [];
  });
  /** The heatmap strip: on a narrow screen it scrolls, and should open on the latest weeks. */
  private readonly yearStrip = viewChild<ElementRef<HTMLElement>>('yearStrip');

  protected readonly weekdays = computed(() => {
    const habit = this.habit();
    return habit ? weekdayConsistency(habit, heatmapStart(this.today()), this.today()) : [];
  });

  protected readonly challengeLengths = [7, 30, 90] as const;
  protected readonly startingChallenge = signal(false);
  protected readonly activeChallenge = computed(
    () => this.habit()?.challenges.find((c) => c.state === 'Active') ?? null,
  );
  protected readonly pastChallenges = computed(
    () => this.habit()?.challenges.filter((c) => c.state !== 'Active') ?? [],
  );

  private get habitId(): number {
    return Number(this.id());
  }

  private readonly injector = inject(Injector);

  constructor() {
    // Once the heatmap has drawn (and whenever its data changes), show the latest weeks on a narrow screen.
    effect(() => {
      const strip = this.yearStrip()?.nativeElement;
      this.year();
      if (strip) {
        afterNextRender(() => (strip.scrollLeft = strip.scrollWidth), { injector: this.injector });
      }
    });
  }

  ngOnInit(): void {
    this.reload();
  }

  protected async toggle(day: string): Promise<void> {
    const habit = this.habit();
    const change = habit ? await entryChangeFor(habit, day) : null;
    if (!habit || !change) {
      return;
    }

    this.busyDay.set(day);
    this.habitsService
      .setEntry(habit.id, day, change.done, this.today(), change.value)
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

  protected startChallenge(days: 7 | 30 | 90): void {
    const habit = this.habit();
    if (!habit) {
      return;
    }
    this.startingChallenge.set(true);
    this.habitsService
      .startChallenge(habit.id, days, this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (challenges) => {
          this.startingChallenge.set(false);
          this.habit.update((current) => (current ? { ...current, challenges } : current));
          this.toast.success(`${days}-day challenge started. Good luck!`);
        },
        error: (err) => {
          this.startingChallenge.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not start the challenge.'));
        },
      });
  }

  protected async removeChallenge(challengeId: number, active: boolean): Promise<void> {
    const habit = this.habit();
    if (!habit) {
      return;
    }
    const answer = await Swal.fire({
      title: active ? 'Stop this challenge?' : 'Remove this challenge?',
      text: active
        ? 'Your ticked days stay; only the challenge goes. You can start a new one any time.'
        : 'It goes from the list; your ticked days stay.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: active ? 'Stop it' : 'Remove',
      confirmButtonColor: 'var(--lifeos-teal-strong)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.habitsService
      .removeChallenge(habit.id, challengeId, this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (challenges) =>
          this.habit.update((current) => (current ? { ...current, challenges } : current)),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the challenge.')),
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
          // The response only carries the last week of logged days; keep the year already shown.
          this.habit.update((current) =>
            current
              ? {
                  ...updated,
                  doneDates: current.doneDates,
                  values: current.values,
                  slipDates: current.slipDates,
                }
              : updated,
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
      confirmButtonColor: 'var(--cui-danger)',
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
      // A year of days: the 12-week grid, the heatmap and the weekday consistency all read from it.
      .get(this.habitId, this.today(), heatmapStart(this.today()))
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
