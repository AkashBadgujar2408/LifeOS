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
  ChartConfiguration,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import {
  APP_DATE_FORMAT,
  APP_DATE_TIME_FORMAT,
  APP_DAY_MONTH_FORMAT,
  APP_TIME_FORMAT,
} from '../../core/dates/date-format';
import { GoalTrendPoint, GoalsService } from '../../core/services/goals.service';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * A goal's progress over time as a stepped teal line on a fixed 0-100% axis: it steps up with each ticked milestone
 * (and down when one is added or the goal is reopened). The points come from the API (GoalProgressTrend), which
 * rebuilds them from milestone and status history; the x axis is real time, so steps sit where they happened.
 * One series, so no legend. Re-reads whenever `version` changes (the goal page bumps it after any change).
 */
@Component({
  selector: 'app-goal-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  // Only what this chart needs, registered where it's used, so Chart.js stays out of the main bundle.
  providers: [
    provideCharts({
      registerables: [LineController, LineElement, PointElement, LinearScale, Tooltip],
    }),
  ],
  template: `
    @if (points(); as points) {
      @if (points.length < 2 || !hasSteps()) {
        <p class="small text-body-secondary mb-0">
          @if (points.length > 0 && points[0].percent === 100) {
            Done from the start: there's no climb to draw.
          } @else {
            The line starts moving with your first ticked milestone.
          }
        </p>
      } @else {
        <div style="position: relative; height: 160px">
          <canvas
            baseChart
            type="line"
            [data]="chartData()"
            [options]="options()"
            role="img"
            [attr.aria-label]="summary()"
          ></canvas>
        </div>
        <p class="small text-body-secondary mt-2 mb-0">{{ summary() }}</p>
      }
    }
  `,
})
export class GoalTrend {
  private readonly goalsService = inject(GoalsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly goalId = input.required<number>();
  /** Anything that changes when the goal's progress may have (the page passes its milestone/status state). */
  readonly version = input<string>('');

  protected readonly points = signal<GoalTrendPoint[] | null>(null);

  protected readonly hasSteps = computed(() => {
    const points = this.points() ?? [];
    return points.some((p) => p.percent !== points[0]?.percent);
  });

  protected readonly summary = computed(() => {
    const points = this.points() ?? [];
    if (points.length < 2) {
      return '';
    }
    const first = points[0];
    const last = points[points.length - 1];
    const since = formatDate(first.at, APP_DATE_FORMAT, this.locale);
    return `From ${first.percent}% on ${since} to ${last.percent}% now, in ${points.length - 2} change${points.length === 3 ? '' : 's'}.`;
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    const points = this.points() ?? [];
    return {
      datasets: [
        {
          label: 'Progress',
          data: points.map((p) => ({ x: Date.parse(p.at), y: p.percent })),
          stepped: 'before',
          borderColor: teal,
          borderWidth: 2,
          // A dot at each change; none on the closing "now" point, which isn't an event.
          pointRadius: points.map((_, i) => (i === points.length - 1 ? 0 : 4)),
          pointHoverRadius: 6,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: 2,
          pointHitRadius: 12,
        },
      ],
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const points = this.points() ?? [];
    const lastIndex = points.length - 1;
    // A goal whose whole history fits in a day or two (just set up) is labelled by time, not by one repeated date.
    const spanMs = points.length ? Date.parse(points[lastIndex].at) - Date.parse(points[0].at) : 0;
    const tickFormat = spanMs < 2 * 24 * 60 * 60 * 1000 ? APP_TIME_FORMAT : APP_DAY_MONTH_FORMAT;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      layout: { padding: { top: 6, right: 8 } },
      scales: {
        y: {
          min: 0,
          max: 100,
          border: { display: false },
          grid: { color: grid },
          ticks: { stepSize: 25, color: muted, font, callback: (value) => `${value}%` },
        },
        x: {
          type: 'linear',
          min: points.length ? Date.parse(points[0].at) : undefined,
          max: points.length ? Date.parse(points[lastIndex].at) : undefined,
          border: { color: grid },
          grid: { display: false },
          ticks: {
            color: muted,
            font,
            maxTicksLimit: 5,
            maxRotation: 0,
            callback: (value) => formatDate(Number(value), tickFormat, this.locale),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) =>
              items.length
                ? items[0].dataIndex === lastIndex
                  ? 'Now'
                  : formatDate(points[items[0].dataIndex].at, APP_DATE_TIME_FORMAT, this.locale)
                : '',
            label: (item) => `${(item.raw as { y: number }).y}% done`,
          },
        },
      },
    };
  });

  constructor() {
    effect(() => {
      const id = this.goalId();
      this.version();
      untracked(() => this.load(id));
    });
  }

  private load(id: number): void {
    this.goalsService
      .trend(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      // The chart is a side view of the goal: if it can't load, the card just keeps its last state.
      .subscribe({ next: (points) => this.points.set(points), error: () => this.points.set([]) });
  }
}
