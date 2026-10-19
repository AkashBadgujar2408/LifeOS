import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { APP_DAY_MONTH_FORMAT, APP_TIME_FORMAT } from '../../core/dates/date-format';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  HealthLockedError,
  HealthService,
  MEAL_TYPES,
  Meal,
  MealType,
  NutritionDay,
  NutritionTrendDay,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend } from './health-trend';
import { MEAL_TYPE_LABELS } from './health-view';
import { openMealEditor } from './meal-editor';

const TREND_DAYS = 14;
const GLASSES = [250, 500];

/** Food and water: one day's meals and glasses (quick-logged), and calories over the last two weeks. */
@Component({
  selector: 'app-health-nutrition',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Food &amp; water</h1>
          <p class="text-body-secondary mb-0 small">
            Roughly is fine — figures are optional, and totals only add up the ones you give.
          </p>
        </div>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (day(); as d) {
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            aria-label="Day before"
            (click)="move(-1)"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <h2 class="h5 mb-0">{{ selected() === today ? 'Today' : (selected() | date) }}</h2>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            aria-label="Day after"
            [disabled]="selected() >= today"
            (click)="move(1)"
          >
            <i class="bi bi-chevron-right"></i>
          </button>
          @if (selected() !== today) {
            <button type="button" class="btn btn-sm btn-link" (click)="goTo(today)">
              Back to today
            </button>
          }
        </div>
        <div class="row g-3 mb-3">
          <div class="col-lg-7">
            <div class="card h-100">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <h3 class="h6 mb-0">Meals</h3>
                  <span class="small text-body-secondary">
                    {{
                      d.calories !== null ? (d.calories | number) + ' kcal' : 'No calories given'
                    }}
                    @if (d.proteinG !== null) {
                      · {{ d.proteinG }} g protein
                    }
                  </span>
                </div>
                @for (type of types; track type) {
                  <div class="border-top py-2 d-flex flex-wrap gap-2 align-items-start">
                    <span class="small text-body-secondary" style="min-width: 5rem">{{
                      typeLabels[type]
                    }}</span>
                    <div class="flex-grow-1 min-w-0">
                      @for (m of mealsOf(type); track m.id) {
                        <div>
                          <button
                            type="button"
                            class="btn btn-link p-0 text-start link-body-emphasis text-decoration-none text-break"
                            (click)="editMeal(m)"
                          >
                            {{ m.description }}
                          </button>
                          @if (m.calories !== null) {
                            <span class="small text-body-secondary"> · {{ m.calories }} kcal</span>
                          }
                        </div>
                      }
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      [attr.aria-label]="'Add ' + typeLabels[type].toLowerCase()"
                      (click)="editMeal(undefined, type)"
                    >
                      <i class="bi bi-plus-lg"></i>
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="card h-100">
              <div class="card-body">
                <h3 class="h6">Water</h3>
                <div class="h4">{{ d.waterMl | number }} ml</div>
                <div class="d-flex flex-wrap gap-2 mb-3">
                  @for (ml of glasses; track ml) {
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      [disabled]="busy()"
                      (click)="addWater(ml)"
                    >
                      <i class="bi bi-cup-straw" aria-hidden="true"></i> +{{ ml }} ml
                    </button>
                  }
                </div>
                @if (d.water.length) {
                  <ul class="list-unstyled small mb-0">
                    @for (w of d.water; track w.id) {
                      <li class="d-flex align-items-center gap-2">
                        <span>{{ w.millilitres }} ml</span>
                        <span class="text-body-secondary">{{
                          w.createdAt | date: timeFormat
                        }}</span>
                        <button
                          type="button"
                          class="btn btn-sm btn-link text-danger p-0 ms-auto"
                          [attr.aria-label]="'Remove ' + w.millilitres + ' ml'"
                          [disabled]="busy()"
                          (click)="removeWater(w.id)"
                        >
                          Remove
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <h2 class="h5">Calories, last {{ trendDays }} days</h2>
            @if (knownDays() === 0) {
              <p class="small text-body-secondary mb-0">
                Give calories on a meal or two and the days show up here.
              </p>
            } @else {
              <app-health-trend
                [labels]="labels()"
                [series]="series()"
                [format]="kcalAxis"
                [summary]="summary()"
              />
              <p class="small text-body-secondary mt-2 mb-1">{{ summary() }}</p>
            }
            <details class="small">
              <summary>Show as a table</summary>
              <table class="table table-sm mt-2 mb-0">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col" class="text-end">Meals</th>
                    <th scope="col" class="text-end">Calories</th>
                    <th scope="col" class="text-end">Water</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of trend(); track t.day) {
                    <tr>
                      <td>{{ t.day | date }}</td>
                      <td class="text-end">{{ t.meals }}</td>
                      <td class="text-end">{{ t.calories ?? '—' }}</td>
                      <td class="text-end">{{ t.waterMl | number }} ml</td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthNutrition {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly types = MEAL_TYPES;
  protected readonly typeLabels = MEAL_TYPE_LABELS;
  protected readonly glasses = GLASSES;
  protected readonly trendDays = TREND_DAYS;
  protected readonly timeFormat = APP_TIME_FORMAT;
  protected readonly today = todayIso();
  protected readonly kcalAxis = (value: number) => `${formatNumber(value, this.locale)} kcal`;
  protected readonly selected = signal(this.today);
  protected readonly day = signal<NutritionDay | null>(null);
  protected readonly trend = signal<NutritionTrendDay[]>([]);
  protected readonly loadFailed = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly labels = computed(() =>
    this.trend().map((t) => formatDate(t.day, APP_DAY_MONTH_FORMAT, this.locale)),
  );
  protected readonly series = computed(() => [
    { label: 'Calories', values: this.trend().map((t) => t.calories) },
  ]);
  protected readonly knownDays = computed(
    () => this.trend().filter((t) => t.calories !== null).length,
  );
  protected readonly summary = computed(() => {
    const known = this.trend().filter((t) => t.calories !== null);
    if (known.length === 0) {
      return '';
    }
    const average = Math.round(known.reduce((sum, t) => sum + t.calories!, 0) / known.length);
    return `About ${formatNumber(average, this.locale)} kcal a day on the ${known.length} day${known.length === 1 ? '' : 's'} with calories given.`;
  });

  constructor() {
    this.load();
  }

  protected mealsOf(type: MealType): Meal[] {
    return (this.day()?.meals ?? []).filter((m) => m.mealType === type);
  }

  protected load(): void {
    forkJoin({
      day: this.healthService.nutritionDay(this.selected()),
      trend: this.healthService.nutritionTrend(
        addDaysIso(this.today, -(TREND_DAYS - 1)),
        this.today,
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ day, trend }) => {
          this.day.set(day);
          this.trend.set(trend);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your food log.",
          ),
      });
  }

  protected move(days: number): void {
    this.goTo(addDaysIso(this.selected(), days));
  }

  protected goTo(day: string): void {
    this.selected.set(day > this.today ? this.today : day);
    this.load();
  }

  protected async editMeal(meal: Meal | undefined, type: MealType = 'Lunch'): Promise<void> {
    if (await openMealEditor(this.modal, this.selected(), meal, type)) {
      this.load();
      this.toast.success('Saved.');
    }
  }

  protected addWater(millilitres: number): void {
    this.busy.set(true);
    this.healthService.addWater(this.selected(), millilitres, this.today).subscribe({
      next: (day) => this.afterWater(day),
      error: (err) => this.waterFailed(err),
    });
  }

  protected removeWater(id: number): void {
    this.busy.set(true);
    this.healthService.removeWater(id).subscribe({
      next: (day) => this.afterWater(day),
      error: (err) => this.waterFailed(err),
    });
  }

  private afterWater(day: NutritionDay): void {
    this.busy.set(false);
    this.day.set(day);
    this.trend.update((trend) =>
      trend.map((t) => (t.day === day.day ? { ...t, waterMl: day.waterMl } : t)),
    );
  }

  private waterFailed(err: unknown): void {
    this.busy.set(false);
    if (!(err instanceof HealthLockedError)) {
      this.toast.error(apiErrorMessage(err, 'Could not log the water.'));
    }
  }
}
