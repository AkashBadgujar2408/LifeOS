import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  BarController,
  BarElement,
  CategoryScale,
  ChartConfiguration,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

/** Canvas can't read CSS variables, so the LifeOS tokens are resolved when the chart is built. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface TrendSeries {
  label: string;
  values: (number | null)[];
  /** A LifeOS colour token; teal by default, `--lifeos-series-N` when there are two. */
  colorToken?: string;
}

/**
 * One health measure over time: bars for amounts per day/week (minutes, hours slept, calories), a line for a
 * measure that moves (weight). One series has no legend (the card title names it); two (blood pressure) get one.
 * Empty values are gaps. Hovering shows the label and value through `format`.
 */
@Component({
  selector: 'app-health-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  providers: [
    provideCharts({
      registerables: [
        BarController,
        BarElement,
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Tooltip,
        Legend,
      ],
    }),
  ],
  template: `
    <div [style.position]="'relative'" [style.height.px]="height()">
      @if (kind() === 'bar') {
        <canvas
          baseChart
          type="bar"
          [data]="barData()"
          [options]="options()"
          role="img"
          [attr.aria-label]="summary()"
        ></canvas>
      } @else {
        <canvas
          baseChart
          type="line"
          [data]="lineData()"
          [options]="options()"
          role="img"
          [attr.aria-label]="summary()"
        ></canvas>
      }
    </div>
  `,
})
export class HealthTrend {
  readonly kind = input<'bar' | 'line'>('bar');
  readonly labels = input.required<string[]>();
  readonly series = input.required<TrendSeries[]>();
  /** How a value reads in the tooltip and on the axis ("7 h 20 min", "80.9 kg"). */
  readonly format = input<(value: number) => string>((value) => String(value));
  /** Start the value axis at zero (amounts) or let it fit the data (a weight). */
  readonly fromZero = input(true);
  /** A fixed value axis (a 1–5 scale), instead of fitting the data. */
  readonly range = input<readonly [number, number] | null>(null);
  readonly height = input(200);
  /** What the chart says, for screen readers (the page shows it as text too). */
  readonly summary = input.required<string>();

  private colors(): string[] {
    const many = this.series().length > 1;
    return this.series().map((s, i) =>
      token(s.colorToken ?? (many ? `--lifeos-series-${i + 1}` : '--lifeos-teal'), '#159895'),
    );
  }

  protected readonly barData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const colors = this.colors();
    return {
      labels: this.labels(),
      datasets: this.series().map((s, i) => ({
        label: s.label,
        data: s.values,
        backgroundColor: colors[i],
        hoverBackgroundColor: colors[i],
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: 28,
        categoryPercentage: 0.8,
        barPercentage: 0.9,
      })),
    };
  });

  protected readonly lineData = computed<ChartConfiguration<'line'>['data']>(() => {
    const colors = this.colors();
    const surface = token('--lifeos-surface', '#ffffff');
    const dense = this.labels().length > 60;
    return {
      labels: this.labels(),
      datasets: this.series().map((s, i) => ({
        label: s.label,
        data: s.values,
        spanGaps: true,
        borderColor: colors[i],
        borderWidth: 2,
        tension: 0.25,
        pointRadius: dense ? 2 : 4,
        pointHoverRadius: dense ? 4 : 6,
        pointBackgroundColor: colors[i],
        pointBorderColor: surface,
        pointBorderWidth: dense ? 0 : 2,
        pointHitRadius: 12,
      })),
    };
  });

  protected readonly options = computed(() => {
    const muted = token('--lifeos-text-secondary', '#5b6b68');
    const grid = token('--lifeos-border', '#dce7e3');
    const font = { family: 'Manrope, sans-serif', size: 11 };
    const format = this.format();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'index' as const, intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      scales: {
        y: {
          beginAtZero: this.fromZero(),
          min: this.range()?.[0],
          max: this.range()?.[1],
          border: { display: false },
          grid: { color: grid },
          ticks: {
            color: muted,
            font,
            maxTicksLimit: 5,
            callback: (value: string | number) => format(Number(value)),
          },
        },
        x: {
          border: { color: grid },
          grid: { display: false },
          ticks: { color: muted, font, maxTicksLimit: 8, maxRotation: 0 },
        },
      },
      plugins: {
        legend: {
          display: this.series().length > 1,
          position: 'top' as const,
          align: 'end' as const,
          labels: { color: muted, font, boxWidth: 10, boxHeight: 10, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: (item: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              item.parsed.y === null
                ? ''
                : `${this.series().length > 1 ? item.dataset.label + ': ' : ''}${format(item.parsed.y)}`,
          },
        },
      },
    };
  });
}
