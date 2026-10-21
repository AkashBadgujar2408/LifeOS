import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, formatDate } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import {
  APP_DATE_FORMAT,
  APP_DATE_TIME_FORMAT,
  APP_WEEKDAY_FORMAT,
} from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import {
  JOURNAL_ENTRY_ENTITY_TYPE,
  JournalEntry,
  JournalService,
  Mood,
  MoodPoint,
} from '../../core/services/journal.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { ToastService } from '../../core/services/toast.service';
import { Attachments } from '../../shared/components/attachments/attachments';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { DayDecisions } from './day-decisions';
import { DayNotes } from './day-notes';
import { MOODS, moodMeta } from './journal-days';
import { MoodTrend } from './mood-trend';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';

/** How far back the recent list reaches. */
const RECENT_DAYS = 30;

/** The mood trend's ranges (the API allows up to 400 days). */
const TREND_RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One page per day (`/journal` = today, `/journal/2026-10-14` = that day): the day's entry with a mood, plus the mood
 * trend and recent entries alongside. There's only ever one entry per day — saving rewrites it.
 */
@Component({
  selector: 'app-journal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    LinkedItems,
    EntityReminders,
    MoodTrend,
    TagPicker,
    DayNotes,
    DayDecisions,
    Attachments,
    NgOptionComponent,
    NgSelectComponent,
  ],
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
  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });

  protected readonly today = signal(todayIso());
  /** The day being written about; a malformed or future date falls back to today. */
  protected readonly day = computed(() => {
    const date = this.date();
    return date && ISO_DAY.test(date) && date <= this.today() ? date : this.today();
  });
  protected readonly isToday = computed(() => this.day() === this.today());
  // A past day's page is titled by its date ("14/Oct/2026 · Journal | LifeOS"); today keeps "Journal".
  private readonly locale = inject(LOCALE_ID);
  private readonly titled = itemTitle(() =>
    this.isToday() ? null : `${formatDate(this.day(), APP_DATE_FORMAT, this.locale)} · Journal`,
  );

  protected readonly entry = signal<JournalEntry | null>(null);
  protected readonly loadingEntry = signal(true);
  protected readonly saving = signal(false);

  protected readonly recent = signal<JournalEntry[]>([]);
  protected readonly moodPoints = signal<MoodPoint[]>([]);
  protected readonly trendRanges = TREND_RANGES;
  protected readonly trendDays = signal<number>(30);
  protected readonly trendLabel = computed(
    () => TREND_RANGES.find((r) => r.days === this.trendDays())?.label ?? '',
  );
  protected readonly trendFrom = computed(() => addDaysIso(this.today(), 1 - this.trendDays()));
  protected readonly tagIds = signal<number[]>([]);
  private readonly dayNotes = viewChild(DayNotes);

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

  protected setTrendDays(days: number): void {
    this.trendDays.set(days);
    this.journalService
      .moods(this.trendFrom(), this.today())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (points) => this.moodPoints.set(points),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load the mood trend.')),
      });
  }

  protected setTags(ids: number[]): void {
    this.tagIds.set(ids);
    this.form.markAsDirty();
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
        tagIds: this.tagIds(),
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
          this.toast.error(apiErrorMessage(err, 'Could not save the entry.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete this entry?',
      text: "The words, the mood, its tags, photos, links and reminders all go. The day's lists and decisions stay.",
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
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the entry.')),
      });
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.form.dirty && !this.dayNotes()?.hasUnsavedChanges()) {
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
        error: (err) => {
          this.loadingEntry.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not load the entry.'));
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
    this.tagIds.set(entry?.tags.map((t) => t.id) ?? []);
  }

  private loadSidePanel(): void {
    const to = this.today();
    // One request pair, one outcome: the side panel is secondary, so a failure is a single toast, not two.
    forkJoin({
      entries: this.journalService.list(addDaysIso(to, 1 - RECENT_DAYS), to),
      points: this.journalService.moods(this.trendFrom(), to),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ entries, points }) => {
          this.recent.set(entries);
          this.moodPoints.set(points);
        },
        error: (err) =>
          this.toast.error(
            apiErrorMessage(err, 'Could not load recent entries and the mood trend.'),
          ),
      });
  }
}
