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
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  BarController,
  BarElement,
  CategoryScale,
  ChartConfiguration,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { APP_DATE_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import {
  LearningService,
  StudyAnalytics,
  StudySubjectSeries,
} from '../../core/services/learning.service';
import { formatMinutes } from '../calendar/calendar-feed';
import { assignSlots, subjectKey, toHours } from './study-chart-view';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const RANGES = [
  { weeks: 12, label: '12 weeks' },
  { weeks: 26, label: '6 months' },
  { weeks: 52, label: 'Year' },
] as const;

/**
 * Learning analytics: hours studied per week, stacked by subject (a skill, else the course/book, else the topic —
 * learning.GetStudyBySubject → StudyAnalytics). Up to five subjects in the categorical series colours plus a grey
 * "Everything else"; a colour stays with its subject when the range changes (assignSlots). The legend carries
 * each subject's total (several colours are under 3:1 on white, so the values are never colour-only), and a
 * week-by-week table sits under the chart. Re-reads whenever `version` changes (the study page bumps it).
 */
@Component({
  selector: 'app-study-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  // Only what this chart needs, registered where it's used, so Chart.js stays out of the main bundle.
  providers: [
    provideCharts({
      registerables: [BarController, BarElement, CategoryScale, LinearScale, Tooltip],
    }),
  ],
  template: `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h2 id="study-chart-heading" class="h6 mb-0">Hours by subject</h2>
      <div class="btn-group btn-group-sm" role="group" aria-label="Range">
        @for (range of ranges; track range.weeks) {
          <button
            type="button"
            class="btn"
            [class.btn-primary]="weeks() === range.weeks"
            [class.btn-outline-secondary]="weeks() !== range.weeks"
            [attr.aria-pressed]="weeks() === range.weeks"
            (click)="weeks.set(range.weeks)"
          >
            {{ range.label }}
          </button>
        }
      </div>
    </div>

    @if (loadFailed()) {
      <p class="small text-body-secondary mb-0">Couldn't load the chart just now.</p>
    } @else if (data(); as data) {
      @if (data.totalMinutes === 0) {
        <p class="small text-body-secondary mb-0">
          Nothing logged in this stretch yet. Time you study shows up here week by week.
        </p>
      } @else {
        <div style="position: relative; height: 220px">
          <canvas
            baseChart
            type="bar"
            [data]="chartData()"
            [options]="options()"
            role="img"
            [attr.aria-label]="summary()"
          ></canvas>
        </div>
        <ul class="list-unstyled d-flex flex-wrap gap-3 small mt-3 mb-0" aria-label="Subjects">
          @for (subject of data.subjects; track key(subject)) {
            <li class="d-flex align-items-center gap-2">
              <span
                class="d-inline-block rounded-1 flex-shrink-0"
                style="width: 10px; height: 10px"
                [style.background]="colorOf(subject)"
                aria-hidden="true"
              ></span>
              <span class="text-break">{{ subject.name }}</span>
              <span class="text-body-secondary">{{ formatMinutes(subject.totalMinutes) }}</span>
            </li>
          }
        </ul>
        <details class="mt-3">
          <summary class="small text-body-secondary">Week by week</summary>
          <div class="table-responsive mt-2">
            <table class="table table-sm small mb-0">
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  @for (subject of data.subjects; track key(subject)) {
                    <th scope="col" class="text-end">{{ subject.name }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (week of data.weeks; track week; let i = $index) {
                  <tr>
                    <th scope="row" class="fw-normal">{{ dayLabel(week) }}</th>
                    @for (subject of data.subjects; track key(subject)) {
                      <td class="text-end">
                        {{
                          subject.minutesByWeek[i] ? formatMinutes(subject.minutesByWeek[i]) : '–'
                        }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    } @else {
      <p class="small text-body-secondary mb-0">Loading…</p>
    }
  `,
})
export class StudyChart {
  private readonly learningService = inject(LearningService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /** Anything that changes when sessions may have (the study page passes a counter). */
  readonly version = input(0);

  protected readonly ranges = RANGES;
  protected readonly formatMinutes = formatMinutes;
  protected readonly key = subjectKey;
  protected readonly weeks = signal<number>(12);
  protected readonly data = signal<StudyAnalytics | null>(null);
  protected readonly loadFailed = signal(false);
  /** Colour slot per subject, kept across reloads so a colour follows its subject. */
  private slots = new Map<string, number>();
  private readonly palette = computed(() => {
    this.data();
    return [1, 2, 3, 4, 5].map((n) => token(`--lifeos-series-${n}`, '#2a78d6'));
  });

  protected readonly summary = computed(() => {
    const data = this.data();
    if (!data || data.subjects.length === 0) {
      return '';
    }
    const top = data.subjects[0];
    return `${formatMinutes(data.totalMinutes)} studied over ${data.weeks.length} weeks, most of it on ${top.name} (${formatMinutes(top.totalMinutes)}).`;
  });

  protected readonly chartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const data = this.data();
    if (!data) {
      return { labels: [], datasets: [] };
    }
    const surface = token('--lifeos-surface', '#ffffff');
    return {
      labels: data.weeks.map((w) => this.dayLabel(w, APP_DAY_MONTH_FORMAT)),
      datasets: data.subjects.map((subject) => ({
        label: subject.name,
        data: subject.minutesByWeek.map(toHours),
        backgroundColor: this.colorOf(subject),
        hoverBackgroundColor: this.colorOf(subject),
        // A 2px surface line between stacked segments.
        borderColor: surface,
        borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        borderSkipped: false,
        borderRadius: 2,
        barPercentage: 0.7,
        categoryPercentage: 0.9,
        stack: 'study',
      })),
    };
  });

  protected readonly options = computed<ChartConfiguration<'bar'>['options']>(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const data = this.data();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          border: { display: false },
          grid: { color: grid },
          ticks: { color: muted, font, maxTicksLimit: 5, callback: (value) => `${value}h` },
        },
        x: {
          stacked: true,
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxRotation: 0, autoSkipPadding: 12 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          // Only the subjects studied that week, biggest first.
          filter: (item) => (item.raw as number) > 0,
          itemSort: (a, b) => (b.raw as number) - (a.raw as number),
          callbacks: {
            title: (items) =>
              items.length && data
                ? `Week of ${this.dayLabel(data.weeks[items[0].dataIndex])}`
                : '',
            label: (item) => {
              const subject = data?.subjects[item.datasetIndex];
              return subject
                ? ` ${subject.name}: ${formatMinutes(subject.minutesByWeek[item.dataIndex])}`
                : '';
            },
            footer: (items) => {
              if (!items.length || !data) {
                return '';
              }
              const total = data.subjects.reduce(
                (sum, s) => sum + s.minutesByWeek[items[0].dataIndex],
                0,
              );
              return `Total ${formatMinutes(total)}`;
            },
          },
        },
      },
    };
  });

  constructor() {
    effect(() => {
      const weeks = this.weeks();
      this.version();
      untracked(() => this.load(weeks));
    });
  }

  protected colorOf(subject: StudySubjectSeries): string {
    const slot = this.slots.get(subjectKey(subject));
    return slot === undefined ? token('--lifeos-series-other', '#a3adab') : this.palette()[slot];
  }

  protected dayLabel(day: string, format = APP_DATE_FORMAT): string {
    return formatDate(day, format, this.locale);
  }

  private load(weeks: number): void {
    this.learningService
      .studyAnalytics(todayIso(), weeks)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.slots = assignSlots(this.slots, data.subjects.map(subjectKey));
          this.loadFailed.set(false);
          this.data.set(data);
        },
        error: () => this.loadFailed.set(true),
      });
  }
}
