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
} from '@angular/core';
import { formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import {
  LearningReached,
  LearningReport as LearningReportModel,
  LearningSubject,
  LearningWeek,
  ReportsService,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { EntityOpener } from '../search/entity-opener';
import { readRange } from './report-range';
import { LEARNING_REACHED, daysText, hours, percentText } from './report-view';

const SUBJECT_KINDS: Record<LearningSubject['kind'], string> = {
  Skill: 'Skill',
  Course: 'Course',
  MediaItem: 'Book',
  Topic: 'Topic',
};

/**
 * The learning report (Session 91): study time over the range — by subject, grouped exactly as the study page's
 * "Hours by subject" chart but every subject listed — week by week, and what was reached (courses completed, books
 * finished, skill levels gained, certifications earned).
 */
@Component({
  selector: 'app-learning-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">Learning</h2>
    @if (hidden().has('Learning')) {
      <p class="text-body-secondary">
        Learning is switched off in <a routerLink="/settings">Settings</a>.
      </p>
    } @else if (loadFailed() && !report()) {
      <app-load-error message="Couldn't load the learning report." (retry)="load()" />
    } @else if (report(); as r) {
      @if (r.totalMinutes === 0 && r.reached.length === 0) {
        <p class="text-body-secondary">
          No study logged and nothing completed in this range.
          <a routerLink="/learning/study">Log study time</a>, and it shows up here.
        </p>
      } @else {
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Time studied</div>
                <div class="h4 mb-0">{{ minutes(r.totalMinutes) }}</div>
                <div class="small text-body-secondary">
                  {{ r.sessions }} sessions on {{ days(r.activeDays) }}
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Courses completed</div>
                <div class="h4 mb-0">{{ r.coursesCompleted }}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Books finished</div>
                <div class="h4 mb-0">{{ r.booksFinished }}</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100">
              <div class="card-body">
                <div class="small text-body-secondary">Skill levels gained</div>
                <div class="h4 mb-0">{{ r.levelUps }}</div>
                <div class="small text-body-secondary">
                  {{ r.certifications }}
                  {{ r.certifications === 1 ? 'certification' : 'certifications' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (r.totalMinutes > 0 && r.weeks.length > 1) {
          <section class="card mb-4" aria-labelledby="learning-weeks-chart">
            <div class="card-body">
              <h3 id="learning-weeks-chart" class="h6">Hours studied, week by week</h3>
              <app-health-trend
                [labels]="weekLabels()"
                [series]="weekSeries()"
                [format]="hoursText"
                [summary]="weekSummary()"
              />
              <p class="small text-body-secondary mt-2 mb-0">{{ weekSummary() }}</p>
            </div>
          </section>
        }

        @if (r.subjects.length) {
          <section class="mb-4" aria-labelledby="learning-subjects">
            <h3 id="learning-subjects" class="h6">By subject</h3>
            <app-data-grid
              name="report-learning-subjects"
              [rows]="r.subjects"
              [columns]="subjectColumns"
              [phoneColumns]="['name', 'minutes']"
              [rowId]="subjectId"
              [noun]="['subject', 'subjects']"
              [clickable]="false"
            />
          </section>
        }

        @if (r.reached.length) {
          <section class="mb-4" aria-labelledby="learning-reached">
            <h3 id="learning-reached" class="h6">Reached</h3>
            <app-data-grid
              name="report-learning-reached"
              [rows]="r.reached"
              [columns]="reachedColumns"
              [phoneColumns]="['day', 'title']"
              [rowId]="reachedId"
              [noun]="['item', 'items']"
              (open)="openReached($event)"
            />
          </section>
        }

        <section aria-labelledby="learning-weeks">
          <h3 id="learning-weeks" class="h6">Weeks</h3>
          <app-data-grid
            name="report-learning-weeks"
            [rows]="r.weeks"
            [columns]="weekColumns"
            [phoneColumns]="['from', 'minutes']"
            [rowId]="weekId"
            [noun]="['week', 'weeks']"
            [clickable]="false"
          />
        </section>
      }
    } @else {
      <p class="text-body-secondary">Loading the learning report...</p>
    }
  `,
})
export class LearningReport {
  private readonly reportsService = inject(ReportsService);
  private readonly opener = inject(EntityOpener);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly minutes = formatMinutes;
  protected readonly days = daysText;
  protected readonly hoursText = (value: number) => formatMinutes(Math.round(value * 60));
  protected readonly report = signal<LearningReportModel | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));

  protected readonly weekLabels = computed(
    () =>
      this.report()?.weeks.map((w) => formatDate(w.from, APP_DAY_MONTH_FORMAT, this.locale)) ?? [],
  );
  protected readonly weekSeries = computed<TrendSeries[]>(() => [
    { label: 'Studied', values: this.report()?.weeks.map((w) => hours(w.minutes)) ?? [] },
  ]);
  protected readonly weekSummary = computed(() => {
    const weeks = this.report()?.weeks ?? [];
    const studied = weeks.filter((w) => w.minutes > 0);
    if (studied.length === 0) {
      return '';
    }
    const busiest = studied.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return (
      `Study in ${studied.length} of ${weeks.length} weeks. ` +
      `Most: ${formatMinutes(busiest.minutes)} (week of ${formatDate(busiest.from, APP_DAY_MONTH_FORMAT, this.locale)}).`
    );
  });

  protected readonly subjectId = (s: LearningSubject) => `${s.kind}:${s.id ?? s.name}`;
  protected readonly reachedId = (r: LearningReached) => `${r.kind}:${r.id}:${r.day}`;
  protected readonly weekId = (w: LearningWeek) => w.weekStart;

  protected readonly subjectColumns: ColDef<LearningSubject>[] = [
    { headerName: 'Subject', field: 'name', flex: 2, minWidth: 180 },
    {
      headerName: 'Kind',
      field: 'kind',
      width: 110,
      valueFormatter: (p) => SUBJECT_KINDS[p.value as LearningSubject['kind']] ?? '',
    },
    {
      headerName: 'Time',
      field: 'minutes',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => formatMinutes(p.value as number),
      context: { csv: (row: LearningSubject) => String(row.minutes) },
    },
    {
      headerName: 'Share',
      field: 'percent',
      width: 100,
      type: 'rightAligned',
      valueFormatter: (p) => percentText((p.value as number | null) ?? null),
      context: { csv: (row: LearningSubject) => String(row.percent ?? '') },
    },
  ];

  protected readonly reachedColumns: ColDef<LearningReached>[] = [
    {
      headerName: 'Day',
      field: 'day',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'What',
      field: 'kind',
      width: 170,
      valueFormatter: (p) => LEARNING_REACHED[p.value as LearningReached['kind']]?.label ?? '',
    },
    { headerName: 'Title', field: 'title', flex: 2, minWidth: 180 },
    { headerName: 'Detail', field: 'detail', flex: 1, minWidth: 140 },
  ];

  protected readonly weekColumns: ColDef<LearningWeek>[] = [
    {
      headerName: 'Week from',
      field: 'from',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'To', field: 'to', width: 130, valueFormatter: dayFormatter(this.locale) },
    {
      headerName: 'Studied',
      field: 'minutes',
      flex: 1,
      minWidth: 110,
      type: 'rightAligned',
      valueFormatter: (p) => ((p.value as number) ? formatMinutes(p.value as number) : '–'),
      context: { csv: (row: LearningWeek) => String(row.minutes) },
    },
  ];

  constructor() {
    effect(() => {
      this.range();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const range = this.range();
    this.reportsService
      .learning(range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (range !== this.range()) {
            return; // an older range answered late
          }
          this.report.set(report);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected openReached(item: LearningReached): void {
    this.opener.open(LEARNING_REACHED[item.kind].entityType, item.id);
  }
}
