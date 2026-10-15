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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { APP_DATE_TIME_FORMAT, APP_WEEKDAY_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import {
  JOURNAL_ENTRY_ENTITY_TYPE,
  JournalEntry,
  JournalService,
  Mood,
  MoodPoint,
} from '../../core/services/journal.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { MOODS, moodMeta } from './journal-days';
import { MoodTrend } from './mood-trend';

/** How far back the side panel's trend and recent list reach. */
const RECENT_DAYS = 30;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One page per day (`/journal` = today, `/journal/2026-10-14` = that day): the day's entry with a mood, plus the mood
 * trend and recent entries alongside. There's only ever one entry per day — saving rewrites it.
 */
@Component({
  selector: 'app-journal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, LinkedItems, EntityReminders, MoodTrend],
  templateUrl: './journal.html',
})
export class Journal {
  private readonly fb = inject(FormBuilder);
  private readonly journalService = inject(JournalService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param; absent on `/journal`. */
  readonly date = input<string>();

  protected readonly moods = MOODS;
  protected readonly moodMeta = moodMeta;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly weekdayFormat = APP_WEEKDAY_FORMAT;
  protected readonly entryEntityType = JOURNAL_ENTRY_ENTITY_TYPE;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });

  protected readonly today = signal(todayIso());
  /** The day being written about; a malformed or future date falls back to today. */
  protected readonly day = computed(() => {
    const date = this.date();
    return date && ISO_DAY.test(date) && date <= this.today() ? date : this.today();
  });
  protected readonly isToday = computed(() => this.day() === this.today());

  protected readonly entry = signal<JournalEntry | null>(null);
  protected readonly loadingEntry = signal(true);
  protected readonly saving = signal(false);

  protected readonly recent = signal<JournalEntry[]>([]);
  protected readonly moodPoints = signal<MoodPoint[]>([]);
  protected readonly trendFrom = computed(() => addDaysIso(this.today(), 1 - RECENT_DAYS));

  protected readonly form = this.fb.group({
    mood: this.fb.control<Mood | null>(null),
    title: this.fb.nonNullable.control('', Validators.maxLength(200)),
    content: this.fb.nonNullable.control('', Validators.maxLength(20000)),
    lifeAreaId: this.fb.control<number | null>(null),
  });

  constructor() {
    effect(() => {
      const day = this.day();
      untracked(() => this.loadDay(day));
    });
    this.loadSidePanel();
  }

  protected selectMood(mood: Mood): void {
    const control = this.form.controls.mood;
    // Clicking the selected mood again clears it (an entry can be words only).
    control.setValue(control.value === mood ? null : mood);
    control.markAsDirty();
    this.emptyError.set(false);
  }

  protected fieldError(name: 'title' | 'content'): string | null {
    const control = this.form.controls[name];
    if (!control.errors?.['maxlength']) {
      return null;
    }
    return name === 'title'
      ? 'Keep the title under 200 characters.'
      : 'Keep the entry under 20,000 characters.';
  }

  /** "Write something or pick a mood" — only after a save attempt, and only while both are still empty. */
  protected readonly emptyError = signal(false);

  protected async goToDay(offset: number | 'today'): Promise<void> {
    const target = offset === 'today' ? this.today() : addDaysIso(this.day(), offset);
    if (target > this.today() || !(await this.confirmDiscard())) {
      return;
    }
    void this.router.navigate(target === this.today() ? ['/journal'] : ['/journal', target]);
  }

  protected async openDay(day: string): Promise<void> {
    if (day !== this.day() && (await this.confirmDiscard())) {
      void this.router.navigate(day === this.today() ? ['/journal'] : ['/journal', day]);
    }
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const content = value.content.trim();
    if (!content && value.mood === null) {
      this.emptyError.set(true);
      return;
    }
    this.emptyError.set(false);
    if (this.form.invalid) {
      return;
    }

    const day = this.day();
    this.saving.set(true);
    this.journalService
      .saveForDay(day, {
        title: value.title.trim() || null,
        content: content || null,
        mood: value.mood,
        lifeAreaId: value.lifeAreaId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.setEntry(saved);
          this.toast.success('Entry saved.');
          this.loadSidePanel();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(err.error?.message ?? 'Could not save the entry.');
        },
      });
  }

  protected async remove(): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete this entry?',
      text: 'The words, the mood, its links and reminders all go.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete entry',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.journalService
      .removeForDay(this.day())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.setEntry(null);
          this.toast.success('Entry deleted.');
          this.loadSidePanel();
        },
        error: (err) => this.toast.error(err.error?.message ?? 'Could not delete the entry.'),
      });
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    const result = await Swal.fire({
      title: 'Leave without saving?',
      text: "What you've written for this day hasn't been saved.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Discard changes',
      cancelButtonText: 'Keep writing',
    });
    return result.isConfirmed;
  }

  private loadDay(day: string): void {
    this.loadingEntry.set(true);
    this.journalService
      .getForDay(day)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.loadingEntry.set(false);
          this.setEntry(entry);
        },
        error: () => {
          this.loadingEntry.set(false);
          this.toast.error('Could not load the entry.');
        },
      });
  }

  private setEntry(entry: JournalEntry | null): void {
    this.entry.set(entry);
    this.emptyError.set(false);
    this.form.reset({
      mood: entry?.mood ?? null,
      title: entry?.title ?? '',
      content: entry?.content ?? '',
      lifeAreaId: entry?.lifeAreaId ?? null,
    });
  }

  private loadSidePanel(): void {
    const from = this.trendFrom();
    const to = this.today();
    this.journalService
      .list(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (entries) => this.recent.set(entries) });
    this.journalService
      .moods(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (points) => this.moodPoints.set(points) });
  }
}
