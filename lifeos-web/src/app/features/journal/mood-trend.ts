import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  CategoryScale,
  ChartConfiguration,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { APP_DATE_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { MoodPoint } from '../../core/services/journal.service';
import { MOODS, averageMood, moodMeta, moodSeries } from './journal-days';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Mood over a range of days: one teal line on a fixed 1-5 axis labelled with the mood words. Days without a mood are
 * gaps the line bridges (the dots show which days were actually recorded); hovering a day shows its date and mood.
 * One series, so no legend — the card title names it.
 */
@Component({
  selector: 'app-mood-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  // Only what a line chart needs, registered where it's used, so Chart.js stays out of the main bundle.
  providers: [
    provideCharts({
      registerables: [
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Tooltip,
      ],
    }),
  ],
  template: `
    @if (recordedCount() === 0) {
      <p class="small text-body-secondary mb-0">
        No moods in this stretch yet. Pick one when you write, and the trend shows up here.
      </p>
    } @else {
      <div style="position: relative; height: 180px">
        <canvas
          baseChart
          type="line"
          [data]="chartData()"
          [options]="options"
          role="img"
          [attr.aria-label]="summary()"
        ></canvas>
      </div>
      <p class="small text-body-secondary mt-2 mb-0">{{ summary() }}</p>
    }
  `,
})
export class MoodTrend {
  private readonly locale = inject(LOCALE_ID);

  readonly points = input.required<MoodPoint[]>();
  /** First and last day of the range, "yyyy-MM-dd". */
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  private readonly series = computed(() => moodSeries(this.points(), this.from(), this.to()));

  protected readonly recordedCount = computed(
    () => this.series().filter((day) => day.mood !== null).length,
  );

  protected readonly summary = computed(() => {
    const average = averageMood(this.series().map((day) => day.mood));
    const count = this.recordedCount();
    if (average === null) {
      return '';
    }
    const nearest = moodMeta(Math.round(average) as 1 | 2 | 3 | 4 | 5).label.toLowerCase();
    return `Average ${average} (${nearest}) across ${count} day${count === 1 ? '' : 's'} with a mood.`;
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    return {
      labels: this.series().map((day) => formatDate(day.day, APP_DAY_MONTH_FORMAT, this.locale)),
      datasets: [
        {
          label: 'Mood',
          data: this.series().map((day) => day.mood),
          spanGaps: true,
          borderColor: teal,
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: 2,
          pointHitRadius: 12,
        },
      ],
    };
  });

  protected readonly options: ChartConfiguration<'line'>['options'] = (() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      scales: {
        y: {
          min: 1,
          max: 5,
          border: { display: false },
          grid: { color: grid },
          ticks: {
            stepSize: 1,
            color: muted,
            font,
            callback: (value) => MOODS[Number(value) - 1]?.label ?? '',
          },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxTicksLimit: 6, maxRotation: 0 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          filter: (item) => item.raw !== null,
          callbacks: {
            title: (items) =>
              items.length
                ? formatDate(this.series()[items[0].dataIndex].day, APP_DATE_FORMAT, this.locale)
                : '',
            label: (item) => moodMeta(item.raw as 1 | 2 | 3 | 4 | 5).label,
          },
        },
      },
    };
  })();
}
