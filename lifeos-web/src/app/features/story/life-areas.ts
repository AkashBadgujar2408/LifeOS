import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { DashboardService } from '../../core/services/dashboard.service';
import { LifeAreaRating, LifeAreaStats, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import {
  activityWindow,
  addMonths,
  levelPercent,
  monthOf,
  ratingChange,
  statsLine,
} from './life-areas-view';

/** One life area's row in the month's form. */
type AreaGroup = FormGroup<{
  lifeAreaId: FormControl<number>;
  rating: FormControl<number | null>;
  note: FormControl<string>;
}>;

/** The 1–10 scale of a self-rating. */
const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Life areas in Story Mode. Two views of each area side by side, on purpose: what you *did* there (activity this
 * month, relative to your busiest area, and an all-time level from everything finished) and how it *feels* (your own
 * 1–10 rating for the month — the Blueprint's Life Balance Wheel is self-assessment). Neither is a judgement; nothing
 * decays and nothing is lost for a quiet month.
 */
@Component({
  selector: 'app-life-areas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, LoadError],
  templateUrl: './life-areas.html',
  styleUrl: './life-areas.scss',
})
export class LifeAreas {
  private readonly fb = inject(FormBuilder);
  private readonly storyService = inject(StoryService);
  private readonly dashboardService = inject(DashboardService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly scale = SCALE;
  protected readonly levelPercent = levelPercent;
  protected readonly statsLine = statsLine;
  protected readonly ratingChange = ratingChange;

  protected readonly today = todayIso();
  protected readonly thisMonth = monthOf(this.today);
  protected readonly month = signal(this.thisMonth);

  protected readonly stats = signal<LifeAreaStats[] | null>(null);
  protected readonly loadFailed = signal(false);
  /** Activity score (0–10, busiest area = 10) per life area for the selected month. */
  protected readonly activity = signal<Map<number, number> | null>(null);
  /** Last month's rating per life area, to show the change. */
  protected readonly previous = signal(new Map<number, number>());
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    areas: this.fb.nonNullable.array<AreaGroup>([]),
  });

  protected readonly totalLevel = computed(() =>
    (this.stats() ?? []).reduce((sum, area) => sum + area.level, 0),
  );

  constructor() {
    this.load();
  }

  protected get areaControls() {
    return this.form.controls.areas;
  }

  protected load(): void {
    this.storyService
      .lifeAreaStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loadFailed.set(false);
          this.form.controls.areas.clear();
          for (const area of stats) {
            this.form.controls.areas.push(this.areaGroup(area.lifeAreaId));
          }
          this.loadMonth(this.month());
        },
        error: (err) => {
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your life areas.'));
        },
      });
  }

  protected async moveMonth(count: number): Promise<void> {
    const target = addMonths(this.month(), count);
    if (target > this.thisMonth || !(await this.confirmDiscard())) {
      return;
    }
    this.month.set(target);
    this.loadMonth(target);
  }

  protected clear(index: number): void {
    const group = this.areaControls.at(index);
    group.patchValue({ rating: null, note: '' });
    group.markAsDirty();
  }

  protected fieldError(index: number): string | null {
    const control = this.areaControls.at(index).controls.note;
    return control.touched && control.errors?.['maxlength']
      ? 'Keep the note under 500 characters.'
      : null;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const month = this.month();
    const ratings = this.areaControls.controls
      .filter((group) => group.dirty)
      .map((group) => {
        const value = group.getRawValue();
        return {
          lifeAreaId: value.lifeAreaId,
          rating: value.rating,
          note: value.rating === null ? null : value.note.trim() || null,
        };
      });
    if (ratings.length === 0) {
      return;
    }

    this.saving.set(true);
    this.storyService
      .saveRatings(month, this.today, ratings)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.applyRatings(saved);
          this.toast.success('Ratings saved.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the ratings.'));
        },
      });
  }

  private areaGroup(lifeAreaId: number): AreaGroup {
    const fb: NonNullableFormBuilder = this.fb.nonNullable;
    return fb.group({
      lifeAreaId: fb.control(lifeAreaId),
      rating: new FormControl<number | null>(null),
      note: fb.control('', Validators.maxLength(500)),
    });
  }

  private loadMonth(month: string): void {
    this.activity.set(null);
    const window = activityWindow(month, this.today);
    forkJoin({
      ratings: this.storyService.ratings(addMonths(month, -1), month),
      balance: this.dashboardService.getLifeBalance(window.from, window.to),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ ratings, balance }) => {
          if (month !== this.month()) {
            return;
          }
          this.activity.set(new Map(balance.areas.map((a) => [a.lifeAreaId, a.score])));
          this.previous.set(
            new Map(ratings.filter((r) => r.month !== month).map((r) => [r.lifeAreaId, r.rating])),
          );
          this.applyRatings(ratings.filter((r) => r.month === month));
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load that month.')),
      });
  }

  /** Puts the month's stored ratings into the form and marks it saved. */
  private applyRatings(ratings: LifeAreaRating[]): void {
    const byArea = new Map(ratings.map((r) => [r.lifeAreaId, r]));
    for (const group of this.areaControls.controls) {
      const rating = byArea.get(group.controls.lifeAreaId.value);
      group.reset({
        lifeAreaId: group.controls.lifeAreaId.value,
        rating: rating?.rating ?? null,
        note: rating?.note ?? '',
      });
    }
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    const result = await Swal.fire({
      title: 'Leave without saving?',
      text: "This month's ratings haven't been saved.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Discard changes',
      cancelButtonText: 'Keep rating',
    });
    return result.isConfirmed;
  }
}
