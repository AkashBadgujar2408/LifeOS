import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import {
  HealthLockedError,
  HealthService,
  LabResult,
  LabTest,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { HealthTrend, TrendSeries } from './health-trend';
import { labRangeText, labValueText } from './health-view';
import { openLabEditor } from './lab-editor';

/** Lab results by test: out of range first, each with its history and — once there are two numbers — a line. */
@Component({
  selector: 'app-health-labs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, HealthTrend],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Lab results</h1>
          <p class="text-body-secondary mb-0 small">
            Each result against the range on its report; the same test over time.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a result
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (tests(); as tests) {
        @if (tests.length === 0) {
          <p class="text-body-secondary">
            No results yet. Add the numbers from your last report to see them over time.
          </p>
        }
        <div class="d-flex flex-column gap-3">
          @for (t of tests; track t.testName) {
            @let latest = t.results[0];
            <section class="card" [attr.aria-labelledby]="'test-' + $index">
              <div class="card-body">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                  <div class="min-w-0">
                    <h2 class="h5 mb-1 text-break" [id]="'test-' + $index">{{ t.testName }}</h2>
                    <div class="small text-body-secondary">
                      Latest {{ latest.takenOn | date }}
                      @if (range(latest); as r) {
                        · range {{ r }}{{ latest.unit ? ' ' + latest.unit : '' }}
                      }
                    </div>
                  </div>
                  <div class="text-end">
                    <div class="h4 mb-0">{{ value(latest) }}</div>
                    @switch (latest.flag) {
                      @case ('High') {
                        <span class="badge text-bg-light border text-danger-emphasis"
                          ><i class="bi bi-arrow-up" aria-hidden="true"></i> Above range</span
                        >
                      }
                      @case ('Low') {
                        <span class="badge text-bg-light border text-danger-emphasis"
                          ><i class="bi bi-arrow-down" aria-hidden="true"></i> Below range</span
                        >
                      }
                      @case ('Normal') {
                        <span class="badge text-bg-light border"
                          ><i class="bi bi-check-lg" aria-hidden="true"></i> In range</span
                        >
                      }
                    }
                  </div>
                </div>
                @if (numeric(t).length >= 2) {
                  <div class="mt-3">
                    <app-health-trend
                      kind="line"
                      [labels]="chart(t).labels"
                      [series]="chart(t).series"
                      [format]="chart(t).format"
                      [fromZero]="false"
                      [height]="160"
                      [summary]="chart(t).summary"
                    />
                  </div>
                }
                <details class="small mt-2" [open]="t.results.length === 1">
                  <summary>
                    {{
                      t.results.length === 1 ? 'The result' : 'All ' + t.results.length + ' results'
                    }}
                  </summary>
                  <ul class="list-unstyled mt-2 mb-0">
                    @for (r of t.results; track r.id) {
                      <li class="d-flex flex-wrap gap-2 align-items-center">
                        <button
                          type="button"
                          class="btn btn-link btn-sm p-0 text-decoration-none"
                          (click)="edit(r)"
                        >
                          {{ r.takenOn | date }} — {{ value(r) }}
                        </button>
                        @if (r.flag === 'High' || r.flag === 'Low') {
                          <span class="text-danger-emphasis"
                            ><i
                              class="bi {{ r.flag === 'High' ? 'bi-arrow-up' : 'bi-arrow-down' }}"
                              aria-hidden="true"
                            ></i>
                            {{ r.flag === 'High' ? 'above' : 'below' }}</span
                          >
                        }
                        @if (r.laboratory) {
                          <span class="text-body-secondary">{{ r.laboratory }}</span>
                        }
                      </li>
                    }
                  </ul>
                </details>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary mt-2"
                  (click)="addTo(t)"
                >
                  <i class="bi bi-plus-lg"></i> Add a {{ t.testName }} result
                </button>
              </div>
            </section>
          }
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthLabs {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly value = labValueText;
  protected readonly range = labRangeText;
  protected readonly tests = signal<LabTest[] | null>(null);
  protected readonly loadFailed = signal<string | null>(null);

  constructor() {
    this.load();
  }

  /** A test's number results, oldest first (the chart's order). */
  protected numeric(test: LabTest): LabResult[] {
    return test.results.filter((r) => r.value !== null).reverse();
  }

  /** Each test's chart inputs, built once per load so the charts get stable references. */
  private readonly charts = computed(
    () =>
      new Map(
        (this.tests() ?? []).map((t) => {
          const results = this.numeric(t);
          const outside = results.filter((r) => r.flag === 'High' || r.flag === 'Low').length;
          return [
            t.testName,
            {
              labels: results.map((r) => formatDate(r.takenOn, APP_DAY_MONTH_FORMAT, this.locale)),
              series: [{ label: t.testName, values: results.map((r) => r.value) }] as TrendSeries[],
              format: (value: number) => (t.unit ? `${value} ${t.unit}` : String(value)),
              summary: results.length
                ? `${results.length} results from ${formatDate(results[0].takenOn, APP_DAY_MONTH_FORMAT, this.locale)}, ${outside} outside the range.`
                : '',
            },
          ] as const;
        }),
      ),
  );

  protected chart(test: LabTest) {
    return this.charts().get(test.testName)!;
  }

  protected load(): void {
    this.healthService
      .labTests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tests) => {
          this.tests.set(tests);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your lab results.",
          ),
      });
  }

  protected async edit(result?: LabResult): Promise<void> {
    if (await openLabEditor(this.modal, result)) {
      this.load();
      this.toast.success('Saved.');
    }
  }

  /** A new result for a known test, with its name, unit and the last range filled in. */
  protected async addTo(test: LabTest): Promise<void> {
    const last = test.results[0];
    const filled = {
      testName: test.testName,
      unit: test.unit,
      rangeLow: last.rangeLow,
      rangeHigh: last.rangeHigh,
    };
    if (await openLabEditor(this.modal, undefined, filled)) {
      this.load();
      this.toast.success('Saved.');
    }
  }
}
