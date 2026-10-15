import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import Swal from 'sweetalert2';
import { APP_DATE_TIME_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { WEEKDAY_NAMES, addDaysIso, todayIso } from '../../core/dates/today';
import {
  JournalDaySummary,
  JournalService,
  WeeklyReview,
} from '../../core/services/journal.service';
import { ToastService } from '../../core/services/toast.service';
import { averageMood, moodMeta, weekStartIso } from './journal-days';
import { InsightsList } from '../dashboard/insights-list';
import { LifeBalance } from '../dashboard/life-balance';
import { DashboardService } from '../../core/services/dashboard.service';
import { apiErrorMessage } from '../../core/services/api-error';

const PROMPTS = [
  {
    name: 'wentWell',
    label: 'What went well?',
    placeholder: 'Wins, small or big. What do you want more of?',
  },
  {
    name: 'wasHard',
    label: 'What was hard?',
    placeholder: 'What drained you, or didn’t go to plan?',
  },
  {
    name: 'nextFocus',
    label: 'What will you focus on next week?',
    placeholder: 'One or two things that would make next week better',
  },
] as const;

type PromptName = (typeof PROMPTS)[number]['name'];

/**
 * The weekly look back (`/journal/week` = this week, `/journal/week/2026-10-05` = that week): three short prompts,
 * next to what the journal recorded each day of the week.
 */
@Component({
  selector: 'app-weekly-reflection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, InsightsList, LifeBalance],
  templateUrl: './weekly-reflection.html',
})
export class WeeklyReflection {
  private readonly fb = inject(FormBuilder);
  private readonly journalService = inject(JournalService);
  private readonly dashboardService = inject(DashboardService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param: the week's Monday; absent on `/journal/week`. */
  readonly weekStart = input<string>();

  protected readonly prompts = PROMPTS;
  protected readonly moodMeta = moodMeta;
  protected readonly dayMonthFormat = APP_DAY_MONTH_FORMAT;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly today = todayIso();
  protected readonly thisWeek = weekStartIso(this.today);
  /** Any day in the param snaps to its Monday; future weeks fall back to this one. */
  protected readonly week = computed(() => {
    const param = this.weekStart();
    const monday = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? weekStartIso(param) : this.thisWeek;
    return monday > this.thisWeek ? this.thisWeek : monday;
  });
  protected readonly isThisWeek = computed(() => this.week() === this.thisWeek);
  /** The life-balance window: Monday to Sunday, or to today for the current week. */
  protected readonly weekEnd = computed(() => {
    const sunday = addDaysIso(this.week(), 6);
    return sunday < this.today ? sunday : this.today;
  });

  /** This week only: the same rule-based insights My Day shows (they're about now, not a past week). */
  protected readonly insights = rxResource({
    params: () => (this.isThisWeek() ? this.today : undefined),
    stream: ({ params }) => this.dashboardService.getMyDay(params).pipe(map((day) => day.insights)),
  });

  protected readonly review = signal<WeeklyReview | null>(null);
  protected readonly saving = signal(false);

  /** Monday to Sunday, each with whatever the journal has for it. */
  protected readonly days = computed(() => {
    const byDay = new Map<string, JournalDaySummary>(
      (this.review()?.days ?? []).map((d) => [d.entryDate, d]),
    );
    return WEEKDAY_NAMES.map((weekday, index) => {
      const day = addDaysIso(this.week(), index);
      return { day, weekday, summary: byDay.get(day) ?? null, future: day > this.today };
    });
  });

  protected readonly weekAverage = computed(() =>
    averageMood((this.review()?.days ?? []).map((d) => d.mood)),
  );
  protected readonly moodDays = computed(
    () => (this.review()?.days ?? []).filter((d) => d.mood !== null).length,
  );

  protected readonly form = this.fb.nonNullable.group({
    wentWell: ['', Validators.maxLength(4000)],
    wasHard: ['', Validators.maxLength(4000)],
    nextFocus: ['', Validators.maxLength(4000)],
  });

  constructor() {
    effect(() => {
      const week = this.week();
      untracked(() => this.load(week));
    });
  }

  protected fieldError(name: PromptName): string | null {
    return this.form.controls[name].errors?.['maxlength']
      ? 'Keep each answer under 4000 characters.'
      : null;
  }

  protected async goToWeek(offset: -1 | 1 | 'this'): Promise<void> {
    const target = offset === 'this' ? this.thisWeek : addDaysIso(this.week(), offset * 7);
    if (target > this.thisWeek || !(await this.confirmDiscard())) {
      return;
    }
    void this.router.navigate(
      target === this.thisWeek ? ['/journal/week'] : ['/journal/week', target],
    );
  }

  protected async openDay(day: string): Promise<void> {
    if (await this.confirmDiscard()) {
      void this.router.navigate(day === this.today ? ['/journal'] : ['/journal', day]);
    }
  }

  protected save(): void {
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const clean = (text: string) => text.trim() || null;
    const payload = {
      wentWell: clean(value.wentWell),
      wasHard: clean(value.wasHard),
      nextFocus: clean(value.nextFocus),
    };
    const clearing = !payload.wentWell && !payload.wasHard && !payload.nextFocus;
    if (clearing && !this.review()?.reflection) {
      this.toast.error('Answer at least one of the prompts first.');
      return;
    }

    this.saving.set(true);
    this.journalService
      .saveWeek(this.week(), payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          this.saving.set(false);
          this.setReview(review);
          this.toast.success(clearing ? 'Reflection cleared.' : 'Reflection saved.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the reflection.'));
        },
      });
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    const result = await Swal.fire({
      title: 'Leave without saving?',
      text: "Your answers for this week haven't been saved.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Discard changes',
      cancelButtonText: 'Keep writing',
    });
    return result.isConfirmed;
  }

  private load(week: string): void {
    this.review.set(null);
    this.journalService
      .getWeek(week)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => this.setReview(review),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load the week.')),
      });
  }

  private setReview(review: WeeklyReview): void {
    this.review.set(review);
    this.form.reset({
      wentWell: review.reflection?.wentWell ?? '',
      wasHard: review.reflection?.wasHard ?? '',
      nextFocus: review.reflection?.nextFocus ?? '',
    });
  }
}
