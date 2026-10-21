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
import { HabitReportWeek } from '../../core/services/reports.service';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved once, when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Build habits' consistency week by week: one teal line on a fixed 0–100% axis (weeks with nothing scheduled are gaps
 * the line bridges), a tooltip with the week and its days, a sentence underneath, and the weeks table on the page.
 * One series, so no legend — the heading names it.
 */
@Component({
  selector: 'app-habit-trend',
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
    <div style="position: relative; height: 200px">
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
  `,
})
export class HabitTrend {
  private readonly locale = inject(LOCALE_ID);

  readonly weeks = input.required<HabitReportWeek[]>();

  protected readonly summary = computed(() => {
    const counted = this.weeks().filter((w) => w.percent !== null);
    if (counted.length === 0) {
      return '';
    }
    const best = counted.reduce((a, b) => (b.percent! > a.percent! ? b : a));
    const worst = counted.reduce((a, b) => (b.percent! < a.percent! ? b : a));
    const day = (iso: string) => formatDate(iso, APP_DATE_FORMAT, this.locale);
    return (
      `${counted.length} week${counted.length === 1 ? '' : 's'} with scheduled days. ` +
      `Best: ${best.percent}% (week of ${day(best.from)}). Lowest: ${worst.percent}% (week of ${day(worst.from)}).`
    );
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const teal = token('--lifeos-teal', '#159895');
    const dense = this.weeks().length > 26;
    return {
      labels: this.weeks().map((w) => formatDate(w.from, APP_DAY_MONTH_FORMAT, this.locale)),
      datasets: [
        {
          label: 'Consistency',
          data: this.weeks().map((w) => w.percent),
          spanGaps: true,
          borderColor: teal,
          borderWidth: 2,
          tension: 0.25,
          pointRadius: dense ? 2 : 4,
          pointHoverRadius: dense ? 4 : 6,
          pointBackgroundColor: teal,
          pointBorderColor: token('--lifeos-surface', '#ffffff'),
          pointBorderWidth: dense ? 0 : 2,
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
          min: 0,
          max: 100,
          border: { display: false },
          grid: { color: grid },
          ticks: { stepSize: 25, color: muted, font, callback: (value) => `${value}%` },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxTicksLimit: 8, maxRotation: 0 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          filter: (item) => item.raw !== null,
          callbacks: {
            title: (items) => {
              const week = items.length ? this.weeks()[items[0].dataIndex] : null;
              return week
                ? `${formatDate(week.from, APP_DATE_FORMAT, this.locale)} – ${formatDate(week.to, APP_DATE_FORMAT, this.locale)}`
                : '';
            },
            label: (item) => {
              const week = this.weeks()[item.dataIndex];
              return `${week.percent}% · ${week.good} of ${week.total} days`;
            },
          },
        },
      },
    };
  })();
}
