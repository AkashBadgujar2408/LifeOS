import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  LOCALE_ID,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DATE_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { AuthService } from '../../core/services/auth.service';
import { CalendarService } from '../../core/services/calendar.service';
import {
  DashboardService,
  MyDay as MyDayData,
  MyDayEvent,
  MyDayHabit,
  MyDayTask,
} from '../../core/services/dashboard.service';
import { HabitsService } from '../../core/services/habits.service';
import { INBOX_KINDS, InboxKind, InboxService } from '../../core/services/inbox.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { REMINDER_TARGET_LABELS, RemindersService } from '../../core/services/reminders.service';
import { TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { eventResultMessage, openEventEditor } from '../calendar/event-editor';
import { HabitDay } from '../habits/habit-day';
import { moodMeta } from '../journal/journal-days';
import { ReminderTargetOpener } from '../reminders/open-reminder-target';
import { ReminderRow } from '../reminders/reminder-row';
import { openTaskEditor } from '../tasks/task-editor';
import {
  daySummary,
  daysBetween,
  habitToday,
  habitsInOrder,
  laterToday,
  splitTasks,
} from './my-day-view';
import { InsightsList } from './insights-list';
import { LifeBalance } from './life-balance';
import { StoryRecap } from '../story/story-recap';
import { LoadError } from '../../shared/components/load-error/load-error';
import { apiErrorMessage } from '../../core/services/api-error';

const KIND_LABELS: Record<InboxKind, [singular: string, plural: string]> = {
  Task: ['Task', 'Tasks'],
  Note: ['Note', 'Notes'],
  Journal: ['Journal entry', 'Journal entries'],
  Idea: ['Idea', 'Ideas'],
};

const PRIORITY_META: Record<string, { icon: string; tone: string } | undefined> = {
  High: { icon: 'bi-flag-fill', tone: 'text-danger' },
  Medium: { icon: 'bi-flag-fill', tone: 'text-warning' },
  Low: { icon: 'bi-flag', tone: 'text-body-secondary' },
};

/** How many active goals the "Goals in motion" card lists before pointing at the Goals page. */
const GOALS_SHOWN = 4;

/**
 * The landing screen: one call (api/Dashboard/MyDay) for today's tasks, events, reminders, habits, goals and the
 * journal, plus the Inbox counts and due reminders the shell already keeps. Ticking a task or a habit here goes
 * through the module's own API, then the snapshot reloads (tasks) or patches in the new streak (habits).
 */
@Component({
  selector: 'app-my-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    ReminderRow,
    HabitDay,
    InsightsList,
    LifeBalance,
    StoryRecap,
    LoadError,
  ],
  templateUrl: './my-day.html',
  styleUrl: './my-day.scss',
})
export class MyDay {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly tasksService = inject(TasksService);
  private readonly habitsService = inject(HabitsService);
  private readonly calendarService = inject(CalendarService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);
  protected readonly inboxService = inject(InboxService);
  protected readonly quickAdd = inject(QuickAddService);
  protected readonly remindersService = inject(RemindersService);
  protected readonly targetOpener = inject(ReminderTargetOpener);

  protected readonly kinds = INBOX_KINDS;
  protected readonly dayMonthFormat = APP_DAY_MONTH_FORMAT;
  protected readonly dateFormat = APP_DATE_FORMAT;
  protected readonly priorityMeta = PRIORITY_META;
  protected readonly targetLabels = REMINDER_TARGET_LABELS;
  protected readonly habitToday = habitToday;
  protected readonly moodMeta = moodMeta;

  /** The user's local date; moves on if the page is still open after midnight (checked on tab focus). */
  protected readonly today = signal(todayIso());
  /** The Life Balance window: the 30 days ending today. */
  protected readonly balanceFrom = computed(() => addDaysIso(this.today(), -29));
  protected readonly data = signal<MyDayData | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busyTaskId = signal<number | null>(null);
  protected readonly busyHabitId = signal<number | null>(null);
  /** Re-read every minute with the reminders, so "later today" drops what's become due. */
  private readonly now = signal(new Date());

  protected readonly greeting = computed(() => {
    const hour = this.now().getHours();
    const partOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = this.authService.currentUser()?.displayName.split(' ')[0];
    return firstName ? `${partOfDay}, ${firstName}.` : `${partOfDay}.`;
  });

  protected readonly summary = computed(() => {
    const data = this.data();
    return data ? daySummary(data) : [];
  });

  protected readonly tasks = computed(() => {
    const data = this.data();
    return data ? splitTasks(data.tasks, data.today) : { overdue: [], today: [] };
  });

  protected readonly habits = computed(() => habitsInOrder(this.data()?.habits ?? []));

  protected readonly laterReminders = computed(() =>
    laterToday(
      this.data()?.reminders ?? [],
      new Set(this.remindersService.due().map((r) => r.id)),
      this.now(),
    ),
  );

  protected readonly goals = computed(() => (this.data()?.goals ?? []).slice(0, GOALS_SHOWN));
  protected readonly moreGoals = computed(
    () => (this.data()?.goals.length ?? 0) - this.goals().length,
  );

  /** Today's entry if there is one, otherwise the latest and how long ago it was. */
  protected readonly journal = computed(() => {
    const entry = this.data()?.latestJournalEntry ?? null;
    if (!entry) {
      return null;
    }
    return {
      entry,
      writtenToday: entry.entryDate === this.today(),
      daysAgo: daysBetween(entry.entryDate, this.today()),
    };
  });

  protected readonly waitingKinds = computed(() =>
    this.kinds
      .map((kind) => {
        const count = this.inboxService.openCounts()[kind];
        return { kind, count, label: count === 1 ? KIND_LABELS[kind][0] : KIND_LABELS[kind][1] };
      })
      .filter((entry) => entry.count > 0),
  );

  constructor() {
    this.load();

    // The shell refreshes due reminders every minute and on focus; follow along to keep the clock-based parts
    // (greeting, "later today") current. A reminder changed elsewhere (snoozed, done, new) needs a fresh snapshot.
    effect(() => {
      this.remindersService.due();
      untracked(() => this.now.set(new Date()));
    });
    let lastVersion = this.remindersService.changedVersion();
    effect(() => {
      const version = this.remindersService.changedVersion();
      if (version !== lastVersion) {
        lastVersion = version;
        untracked(() => this.load());
      }
    });

    // Coming back to a tab left open overnight: today has moved on.
    const onFocus = () => {
      if (todayIso() !== this.today()) {
        this.today.set(todayIso());
        this.load();
      }
    };
    window.addEventListener('focus', onFocus);
    this.destroyRef.onDestroy(() => window.removeEventListener('focus', onFocus));
  }

  protected load(): void {
    this.dashboardService
      .getMyDay(this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadError.set(false);
        },
        error: () => this.loadError.set(true),
      });
  }

  protected toggleTask(task: MyDayTask): void {
    const completing = !task.isDone;
    this.busyTaskId.set(task.id);
    this.tasksService
      .setCompleted(task.id, completing, this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ nextOccurrence }) => {
          this.busyTaskId.set(null);
          if (nextOccurrence?.dueDate) {
            const due = formatDate(nextOccurrence.dueDate, APP_DATE_FORMAT, this.locale);
            this.toast.success(`Done. Next one is due ${due}.`);
          }
          // Reload rather than patch: a done overdue task leaves the list, a repeat may land today.
          this.load();
        },
        error: (err) => {
          this.busyTaskId.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the task.'));
        },
      });
  }

  protected openTask(task: MyDayTask): void {
    this.tasksService
      .get(task.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async (full) => {
          const result = await openTaskEditor(this.modal, { task: full });
          if (result) {
            this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
            this.load();
          }
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the task.')),
      });
  }

  protected openEvent(event: MyDayEvent): void {
    this.calendarService
      .getEvent(event.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async (full) => {
          const occurrence = event.occurrenceDate
            ? {
                occurrenceDate: event.occurrenceDate,
                startDate: event.startDate,
                endDate: event.endDate,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
              }
            : undefined;
          const result = await openEventEditor(this.modal, { event: full, occurrence });
          if (result) {
            this.toast.success(eventResultMessage(result));
            this.load();
          }
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the event.')),
      });
  }

  protected toggleHabit(habit: MyDayHabit): void {
    const done = habitToday(habit) !== 'done';
    this.busyHabitId.set(habit.id);
    this.habitsService
      .setEntry(habit.id, this.today(), done, this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ streak }) => {
          this.busyHabitId.set(null);
          // The API returns the new streak; patch it in instead of re-reading the whole day.
          this.data.update((data) =>
            data
              ? {
                  ...data,
                  habits: data.habits.map((h) => (h.id === habit.id ? { ...h, streak } : h)),
                }
              : data,
          );
        },
        error: (err) => {
          this.busyHabitId.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not update the habit.'));
        },
      });
  }

  /** An all-day event that started before today or runs past it. */
  protected spansDays(event: MyDayEvent): boolean {
    return event.isAllDay && event.startDate !== event.endDate;
  }

  /** A timed event that began before today's local midnight (shown as "until …"). */
  protected startedEarlier(event: MyDayEvent): boolean {
    return !event.isAllDay && new Date(event.startsAt!) < new Date(`${this.today()}T00:00:00`);
  }
}
