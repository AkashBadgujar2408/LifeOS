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
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { PrintService } from '../../core/services/print.service';
import { AnnualReview, ReportsService } from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { formatMoney } from '../finance/finance-view';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { beatText } from '../story/story-view';
import { averageText, percentText } from './report-view';

/** The first year offered (the API's AnnualReviewService.FirstYear). */
const FIRST_YEAR = 1960;

/**
 * The Annual Life Review (Session 92): one year from every side — the Story's chapters, achievements and big moments,
 * then each report's headline figures for Jan 1 – Dec 31, computed by the same API code as the report tabs (each
 * section links to its tab for that year, where the numbers match). Sections of switched-off modules are left out;
 * Health isn't here (it would need the vault unlock — its tab is one click away).
 */
@Component({
  selector: 'app-annual-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <a class="small d-print-none" routerLink="/reports" [queryParams]="yearRange()">
            <i class="bi bi-arrow-left"></i> Reports
          </a>
          <h1 class="h3 mb-0 mt-1">{{ shownYear() }} in review</h1>
        </div>
        <div class="d-flex gap-2 d-print-none">
          <div class="btn-group" role="group" aria-label="Year">
            <a
              class="btn btn-outline-secondary"
              [class.disabled]="shownYear() <= firstYear"
              [attr.aria-disabled]="shownYear() <= firstYear"
              [routerLink]="['/reports/year', shownYear() - 1]"
              aria-label="Previous year"
              ><i class="bi bi-chevron-left"></i
            ></a>
            <a
              class="btn btn-outline-secondary"
              [class.disabled]="shownYear() >= thisYear"
              [attr.aria-disabled]="shownYear() >= thisYear"
              [routerLink]="['/reports/year', shownYear() + 1]"
              aria-label="Next year"
              ><i class="bi bi-chevron-right"></i
            ></a>
          </div>
          <button type="button" class="btn btn-outline-secondary" (click)="print()">
            <i class="bi bi-printer"></i> Print
          </button>
        </div>
      </div>

      @if (loadFailed() && !review()) {
        <app-load-error message="Couldn't load the year in review." (retry)="load()" />
      } @else if (review(); as r) {
        @if (!hidden().has('Story')) {
          <section class="card mb-4" aria-labelledby="review-story">
            <div class="card-body">
              <h2 id="review-story" class="h5">The story of {{ r.year }}</h2>
              @if (r.chapters.length) {
                <p class="mb-2">
                  @for (chapter of r.chapters; track chapter.id; let last = $last) {
                    <strong>{{ chapter.title }}</strong>
                    <span class="text-body-secondary small">
                      ({{ chapter.startDate | date }} –
                      {{ chapter.endDate ? (chapter.endDate | date) : 'now' }})</span
                    >{{ last ? '' : ' · ' }}
                  }
                </p>
              }
              <p class="small text-body-secondary">
                {{ r.storyBeats }} moments in your <a routerLink="/story">Life Story</a> this year.
              </p>

              @if (r.highlights.length) {
                <h3 class="h6 mt-3">Big moments</h3>
                <ul class="list-unstyled mb-0">
                  @for (beat of r.highlights; track $index) {
                    <li class="d-flex gap-2 mb-1">
                      <i
                        class="bi {{ beatWords(beat).icon }} text-body-secondary"
                        aria-hidden="true"
                      ></i>
                      <span class="text-body-secondary small text-nowrap">{{
                        beat.day | date
                      }}</span>
                      <span class="min-w-0">{{ beatWords(beat).headline }}</span>
                    </li>
                  }
                </ul>
              }

              @if (r.achievements.length) {
                <h3 class="h6 mt-3">Achievements earned</h3>
                <ul class="list-unstyled d-flex flex-wrap gap-3 mb-0">
                  @for (a of r.achievements; track a.key) {
                    <li class="d-flex align-items-center gap-2">
                      <i
                        class="bi {{ a.icon }}"
                        style="color: var(--lifeos-teal)"
                        aria-hidden="true"
                      ></i>
                      <span>{{ a.title }}</span>
                      <span class="small text-body-secondary">{{ a.unlockedOn | date }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </section>
        }

        <div class="row g-3 mb-4">
          @if (!hidden().has('Goals')) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-goals">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-goals" class="h6">Goals</h2>
                  <div class="h4 mb-0">{{ r.goals.completed }} completed</div>
                  <p class="small text-body-secondary mb-2">
                    {{ r.goals.onTime }} on time · {{ r.goals.late }} late · on-time rate
                    {{ percent(r.goals.onTimePercent) }}. {{ r.goals.missed }} missed,
                    {{ r.goals.abandoned }} abandoned, {{ r.goals.started }} started.
                  </p>
                  <a
                    class="small d-print-none"
                    routerLink="/reports/goals"
                    [queryParams]="yearRange()"
                    >Goal report</a
                  >
                </div>
              </div>
            </section>
          }
          @if (!hidden().has('Habits')) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-habits">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-habits" class="h6">Habits</h2>
                  <div class="h4 mb-0">{{ percent(r.habitsBuild.percent) }} kept</div>
                  <p class="small text-body-secondary mb-2">
                    {{ r.habitsBuild.good }} of {{ r.habitsBuild.total }} scheduled days done.
                    @if (r.habitsAvoid.total) {
                      Avoid habits clean {{ percent(r.habitsAvoid.percent) }} of days.
                    }
                  </p>
                  <a
                    class="small d-print-none"
                    routerLink="/reports/habits"
                    [queryParams]="yearRange()"
                    >Habit report</a
                  >
                </div>
              </div>
            </section>
          }
          @if (!hidden().has('Tasks')) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-tasks">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-tasks" class="h6">Tasks and focus</h2>
                  <div class="h4 mb-0">{{ r.tasks.completed }} tasks done</div>
                  <p class="small text-body-secondary mb-2">
                    {{ minutes(r.focus.minutes) }} of focus over {{ r.focus.sessions }} sessions.
                    Overdue rate {{ percent(r.tasks.overdueRate) }}.
                  </p>
                  <a
                    class="small d-print-none"
                    routerLink="/reports/productivity"
                    [queryParams]="yearRange()"
                    >Productivity report</a
                  >
                </div>
              </div>
            </section>
          }
          @if (!hidden().has('Learning')) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-learning">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-learning" class="h6">Learning</h2>
                  <div class="h4 mb-0">{{ minutes(r.studyMinutes) }} studied</div>
                  <p class="small text-body-secondary mb-2">
                    {{ r.coursesCompleted }} courses completed, {{ r.booksFinished }} books
                    finished, {{ r.skillLevelUps }} skill levels gained,
                    {{ r.certifications }} certifications.
                  </p>
                  <a
                    class="small d-print-none"
                    routerLink="/reports/learning"
                    [queryParams]="yearRange()"
                    >Learning report</a
                  >
                </div>
              </div>
            </section>
          }
          @if (!hidden().has('Finance') && r.money.currency) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-money">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-money" class="h6">Money</h2>
                  <div class="h4 mb-0">{{ money(r.money.net) }} kept</div>
                  <p class="small text-body-secondary mb-2">
                    {{ moneySentence() }}
                  </p>
                  <a
                    class="small d-print-none"
                    routerLink="/reports/money"
                    [queryParams]="yearRange()"
                    >Money report</a
                  >
                </div>
              </div>
            </section>
          }
          @if (!hidden().has('Leisure')) {
            <section class="col-12 col-md-6 col-xl-4" aria-labelledby="review-media">
              <div class="card h-100">
                <div class="card-body">
                  <h2 id="review-media" class="h6">Books, films and more</h2>
                  <div class="h4 mb-0">{{ r.media.finished }} finished</div>
                  <p class="small text-body-secondary mb-2">
                    {{ minutes(r.media.minutes) }} logged.
                    @if (r.media.topRated.length) {
                      Best of the year:
                      @for (item of r.media.topRated.slice(0, 3); track item.id; let last = $last) {
                        {{ item.title }}{{ last ? '.' : ', ' }}
                      }
                    }
                  </p>
                  <a class="small d-print-none" [routerLink]="['/leisure/year', r.year]"
                    >Year in media</a
                  >
                </div>
              </div>
            </section>
          }
        </div>

        @if (balanceAreas().length) {
          <section class="card mb-4" aria-labelledby="review-balance">
            <div class="card-body">
              <h2 id="review-balance" class="h6">Life balance</h2>
              <app-health-trend
                [labels]="balanceLabels()"
                [series]="balanceSeries()"
                [range]="[0, 10]"
                [summary]="balanceSummary()"
                [height]="200"
              />
              <p class="small text-body-secondary mt-2 mb-2">{{ balanceSummary() }}</p>
              <a
                class="small d-print-none"
                routerLink="/reports/balance"
                [queryParams]="yearRange()"
                >Life balance month by month</a
              >
            </div>
          </section>
        }
      } @else {
        <p class="text-body-secondary">Putting the year together...</p>
      }
    </div>
  `,
})
export class AnnualReviewPage {
  private readonly reportsService = inject(ReportsService);
  private readonly settings = inject(SettingsService);
  private readonly printService = inject(PrintService);
  private readonly destroyRef = inject(DestroyRef);

  /** From the route (`/reports/year/:year`). */
  readonly year = input<string | undefined>();

  protected readonly firstYear = FIRST_YEAR;
  protected readonly thisYear = Number(todayIso().slice(0, 4));
  protected readonly hidden = this.settings.hiddenModules;
  protected readonly percent = percentText;
  protected readonly minutes = formatMinutes;
  protected readonly beatWords = beatText;
  protected readonly review = signal<AnnualReview | null>(null);
  protected readonly loadFailed = signal(false);

  /** The year asked for, kept between the first year offered and this one. */
  protected readonly shownYear = computed(() => {
    const asked = Number(this.year());
    return Number.isInteger(asked)
      ? Math.min(Math.max(asked, FIRST_YEAR), this.thisYear)
      : this.thisYear;
  });
  protected readonly yearRange = computed(() => ({
    from: `${this.shownYear()}-01-01`,
    to: `${this.shownYear()}-12-31`,
  }));

  protected readonly money = (amount: number) =>
    formatMoney(amount, this.review()?.money.currency ?? 'XXX');

  /** "₹1,00,000.00 in, ₹50,000.00 out (50% saved). Net worth up ₹60,000.00." */
  protected readonly moneySentence = computed(() => {
    const m = this.review()?.money;
    if (!m?.currency) {
      return '';
    }
    const saved = m.savingsRate === null ? '' : ` (${m.savingsRate}% saved)`;
    const worth =
      m.netWorthChange === null
        ? ''
        : ` Net worth ${m.netWorthChange >= 0 ? 'up' : 'down'} ${this.money(Math.abs(m.netWorthChange))}.`;
    return `${this.money(m.income)} in, ${this.money(m.spending)} out${saved}.${worth}`;
  });

  protected readonly balanceAreas = computed(() => {
    const hiddenIds = this.settings.hiddenLifeAreaIds();
    return this.review()?.lifeBalance.filter((a) => !hiddenIds.has(a.lifeAreaId)) ?? [];
  });
  protected readonly balanceLabels = computed(() => this.balanceAreas().map((a) => a.lifeAreaName));
  protected readonly balanceSeries = computed<TrendSeries[]>(() => [
    { label: 'Activity', values: this.balanceAreas().map((a) => a.averageScore) },
    { label: 'Your rating', values: this.balanceAreas().map((a) => a.averageRating) },
  ]);
  protected readonly balanceSummary = computed(() =>
    this.balanceAreas()
      .map(
        (a) =>
          `${a.lifeAreaName}: activity ${averageText(a.averageScore)}, rating ${averageText(a.averageRating)}`,
      )
      .join('. '),
  );

  constructor() {
    itemTitle(() => `${this.shownYear()} in review`);
    effect(() => {
      this.shownYear();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const year = this.shownYear();
    this.review.set(null);
    this.reportsService
      .year(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          if (year !== this.shownYear()) {
            return; // an older year answered late
          }
          this.review.set(review);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected print(): void {
    void this.printService.print();
  }
}
