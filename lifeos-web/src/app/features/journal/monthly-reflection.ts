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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { APP_DATE_TIME_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { JournalService, MonthlyReview } from '../../core/services/journal.service';
import { ToastService } from '../../core/services/toast.service';
import { addMonths, monthOf } from '../story/life-areas-view';
import { verdictMeta } from './decision-view';
import { moodMeta } from './journal-days';

const PROMPTS = [
  {
    name: 'highlights',
    label: 'What were the best moments?',
    placeholder: 'The days, people and wins you want to remember',
  },
  {
    name: 'learned',
    label: 'What did this month teach you?',
    placeholder: 'About work, people, yourself',
  },
  {
    name: 'wouldChange',
    label: 'What would you do differently?',
    placeholder: 'Not regrets — adjustments',
  },
  {
    name: 'nextFocus',
    label: 'What matters most next month?',
    placeholder: 'One or two things to give your attention to',
  },
] as const;

type PromptName = (typeof PROMPTS)[number]['name'];

/** "2026-10" → "2026-10-01"; anything else → null. */
function monthKey(param: string | undefined): string | null {
  return param &&
    /^\d{4}-\d{2}$/.test(param) &&
    Number(param.slice(5)) >= 1 &&
    Number(param.slice(5)) <= 12
    ? `${param}-01`
    : null;
}

/**
 * The monthly look back (`/journal/month` = this month, `/journal/month/2026-09` = that month): four prompts next to
 * what the month's journal holds — days written, mood, gratitude, lessons, decisions, the standout days.
 */
@Component({
  selector: 'app-monthly-reflection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './monthly-reflection.html',
})
export class MonthlyReflection {
  private readonly fb = inject(FormBuilder);
  private readonly journalService = inject(JournalService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param "yyyy-MM"; absent on `/journal/month`. */
  readonly month = input<string>();

  protected readonly prompts = PROMPTS;
  protected readonly moodMeta = moodMeta;
  protected readonly verdictMeta = verdictMeta;
  protected readonly dayMonthFormat = APP_DAY_MONTH_FORMAT;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly today = todayIso();
  protected readonly thisMonth = monthOf(this.today);
  /** Future months fall back to this one. */
  protected readonly monthStart = computed(() => {
    const key = monthKey(this.month()) ?? this.thisMonth;
    return key > this.thisMonth ? this.thisMonth : key;
  });
  protected readonly isThisMonth = computed(() => this.monthStart() === this.thisMonth);

  protected readonly review = signal<MonthlyReview | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    highlights: ['', Validators.maxLength(4000)],
    learned: ['', Validators.maxLength(4000)],
    wouldChange: ['', Validators.maxLength(4000)],
    nextFocus: ['', Validators.maxLength(4000)],
  });

  constructor() {
    effect(() => {
      const month = this.monthStart();
      untracked(() => this.load(month));
    });
  }

  protected fieldError(name: PromptName): string | null {
    return this.form.controls[name].errors?.['maxlength']
      ? 'Keep each answer under 4000 characters.'
      : null;
  }

  protected async goToMonth(offset: -1 | 1 | 'this'): Promise<void> {
    const target = offset === 'this' ? this.thisMonth : addMonths(this.monthStart(), offset);
    if (target > this.thisMonth || !(await this.confirmDiscard())) {
      return;
    }
    void this.router.navigate(
      target === this.thisMonth ? ['/journal/month'] : ['/journal/month', target.slice(0, 7)],
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
      highlights: clean(value.highlights),
      learned: clean(value.learned),
      wouldChange: clean(value.wouldChange),
      nextFocus: clean(value.nextFocus),
    };
    const clearing = Object.values(payload).every((answer) => answer === null);
    if (clearing && !this.review()?.reflection) {
      this.toast.error('Answer at least one of the prompts first.');
      return;
    }

    this.saving.set(true);
    this.journalService
      .saveMonth(this.monthStart(), payload)
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

  protected load(month = this.monthStart()): void {
    this.review.set(null);
    this.loadFailed.set(false);
    this.journalService
      .getMonth(month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => this.setReview(review),
        error: (err) => {
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load the month.'));
        },
      });
  }

  private setReview(review: MonthlyReview): void {
    this.review.set(review);
    const r = review.reflection;
    this.form.reset({
      highlights: r?.highlights ?? '',
      learned: r?.learned ?? '',
      wouldChange: r?.wouldChange ?? '',
      nextFocus: r?.nextFocus ?? '',
    });
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    const result = await Swal.fire({
      title: 'Leave without saving?',
      text: "Your answers for this month haven't been saved.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Discard changes',
      cancelButtonText: 'Keep writing',
    });
    return result.isConfirmed;
  }
}
