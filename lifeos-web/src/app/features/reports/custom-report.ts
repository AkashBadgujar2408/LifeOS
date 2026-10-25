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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import Swal from 'sweetalert2';
import { APP_DATE_FORMAT, APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { apiErrorMessage } from '../../core/services/api-error';
import { LifeAreasService } from '../../core/services/life-areas.service';
import {
  CustomCompare,
  CustomGrouping,
  CustomMetric,
  CustomReportDefinition,
  CustomReportResult,
  ReportRange,
  ReportsService,
  SavedReport,
} from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import { TagsService } from '../../core/services/tags.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { formatMoney } from '../finance/finance-view';
import { HealthTrend, TrendSeries } from '../health/health-trend';
import { REPORT_PRESETS, ReportPreset, presetOf, presetRange, readRange } from './report-range';

interface BucketRow {
  index: number;
  from: string;
  to: string;
  value: number | null;
  comparedFrom: string | null;
  comparedTo: string | null;
  compared: number | null;
}

const COMPARE_LABELS: Record<CustomCompare, string> = {
  None: 'Nothing',
  PreviousPeriod: 'The period before',
  PreviousYear: 'The same days a year before',
};

/**
 * Custom reports (Session 93): pick something to count (any report tab's figure, filtered by life area or tag where
 * that tab has a breakdown), group it by week or month over the page's range, compare it with the period before or
 * the year before, and save the definition. The API reruns the tabs' own report code for every bucket, so a custom
 * report always agrees with the tabs; only the definition is saved, so a saved report reruns the same way. A range
 * that is one of the presets is saved as that preset (it moves with the date); any other is saved as fixed days.
 */
@Component({
  selector: 'app-custom-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DataGrid, LoadError, HealthTrend],
  template: `
    <h2 class="d-none d-print-block h5">{{ printTitle() }}</h2>
    <div class="row g-3">
      <aside class="col-12 col-lg-3 d-print-none" aria-labelledby="custom-saved">
        <div class="card">
          <div class="card-body">
            <h3 id="custom-saved" class="h6">Saved reports</h3>
            @if (savedFailed()) {
              <p class="small text-body-secondary mb-0">Couldn't load your saved reports.</p>
            } @else if (savedList().length === 0) {
              <p class="small text-body-secondary mb-0">
                None yet. Build one here and save it to rerun any time.
              </p>
            } @else {
              <ul class="list-unstyled mb-0">
                @for (report of savedList(); track report.id) {
                  <li>
                    <a
                      class="d-block py-1 text-truncate"
                      [class.fw-semibold]="report.id === savedId()"
                      [routerLink]="[]"
                      [queryParams]="savedParams(report)"
                      >{{ report.name }}</a
                    >
                  </li>
                }
              </ul>
            }
            <a
              class="btn btn-sm btn-outline-secondary mt-3"
              [routerLink]="[]"
              [queryParams]="{ saved: null }"
              queryParamsHandling="merge"
              ><i class="bi bi-plus-lg"></i> New report</a
            >
          </div>
        </div>
      </aside>

      <div class="col-12 col-lg-9">
        <form [formGroup]="form" (ngSubmit)="run()" class="card mb-3 d-print-none" novalidate>
          <div class="card-body row g-3">
            <div class="col-12 col-md-6">
              <label class="form-label" for="custom-metric">Count</label>
              <select
                id="custom-metric"
                class="form-select"
                formControlName="metric"
                [class.is-invalid]="fieldError('metric')"
              >
                <option value="" [selected]="!form.controls.metric.value">
                  Pick something to count
                </option>
                @for (m of metrics(); track m.key) {
                  <option [value]="m.key" [selected]="m.key === form.controls.metric.value">
                    {{ m.label }}
                  </option>
                }
              </select>
              @if (fieldError('metric'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>

            @if (metric()?.filter === 'LifeArea' || metric()?.filter === 'LifeAreaRequired') {
              <div class="col-12 col-md-6">
                <label class="form-label" for="custom-area">Life area</label>
                <select
                  id="custom-area"
                  class="form-select"
                  formControlName="lifeAreaId"
                  [class.is-invalid]="fieldError('lifeAreaId')"
                >
                  <option [ngValue]="null" [selected]="form.controls.lifeAreaId.value === null">
                    {{
                      metric()?.filter === 'LifeAreaRequired'
                        ? 'Pick a life area'
                        : 'Every life area'
                    }}
                  </option>
                  @for (area of areas(); track area.id) {
                    <option
                      [ngValue]="area.id"
                      [selected]="area.id === form.controls.lifeAreaId.value"
                    >
                      {{ area.name }}
                    </option>
                  }
                </select>
                @if (fieldError('lifeAreaId'); as error) {
                  <div class="invalid-feedback d-block">{{ error }}</div>
                }
              </div>
            }
            @if (metric()?.filter === 'Tag') {
              <div class="col-12 col-md-6">
                <label class="form-label" for="custom-tag">Tag</label>
                <select id="custom-tag" class="form-select" formControlName="tagId">
                  <option [ngValue]="null" [selected]="form.controls.tagId.value === null">
                    All spending
                  </option>
                  @for (tag of tags(); track tag.id) {
                    <option [ngValue]="tag.id" [selected]="tag.id === form.controls.tagId.value">
                      {{ tag.name }}
                    </option>
                  }
                </select>
              </div>
            }

            <div class="col-6 col-md-3">
              <label class="form-label" for="custom-grouping">Group by</label>
              <select id="custom-grouping" class="form-select" formControlName="grouping">
                <option value="Week" [selected]="form.controls.grouping.value === 'Week'">
                  Week
                </option>
                <option value="Month" [selected]="form.controls.grouping.value === 'Month'">
                  Month
                </option>
              </select>
            </div>
            <div class="col-6 col-md-4">
              <label class="form-label" for="custom-compare">Compare with</label>
              <select id="custom-compare" class="form-select" formControlName="compare">
                @for (c of compares; track c) {
                  <option [value]="c" [selected]="c === form.controls.compare.value">
                    {{ compareLabels[c] }}
                  </option>
                }
              </select>
            </div>
            <div class="col-12 col-md-5 d-flex align-items-end">
              <p class="small text-body-secondary mb-2">
                Over {{ rangeWords() }} — change it with the range above.
              </p>
            </div>

            <div class="col-12 d-flex flex-wrap gap-2 align-items-start">
              <button type="submit" class="btn btn-primary" [disabled]="running()">
                {{ running() ? 'Working it out…' : 'Show' }}
              </button>
              <div class="ms-md-auto d-flex flex-wrap gap-2 align-items-start">
                <div>
                  <label class="visually-hidden" for="custom-name">Name</label>
                  <input
                    id="custom-name"
                    type="text"
                    class="form-control"
                    formControlName="name"
                    placeholder="Name it, e.g. Focus by month"
                    maxlength="100"
                    [class.is-invalid]="fieldError('name')"
                    (keydown.enter)="$event.preventDefault(); save()"
                  />
                  @if (fieldError('name'); as error) {
                    <div class="invalid-feedback d-block">{{ error }}</div>
                  }
                </div>
                <button
                  type="button"
                  class="btn btn-outline-primary"
                  (click)="save()"
                  [disabled]="saving()"
                >
                  {{ savedId() ? 'Save changes' : 'Save' }}
                </button>
                @if (savedId()) {
                  <button type="button" class="btn btn-outline-danger" (click)="remove()">
                    Delete
                  </button>
                }
              </div>
            </div>
          </div>
        </form>

        @if (runFailed()) {
          <app-load-error [message]="runFailed()!" (retry)="run()" />
        } @else if (result(); as r) {
          <div class="row g-3 mb-3">
            <div class="col-12 col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <div class="small text-body-secondary">{{ subject() }}</div>
                  <div class="h4 mb-0">{{ value(r.period.total) }}</div>
                  <div class="small text-body-secondary">
                    {{ fullDay(r.period.from) }} – {{ fullDay(r.period.to) }}
                  </div>
                </div>
              </div>
            </div>
            @if (r.compared; as c) {
              <div class="col-6 col-md-4">
                <div class="card h-100">
                  <div class="card-body">
                    <div class="small text-body-secondary">Compared with</div>
                    <div class="h4 mb-0">{{ value(c.total) }}</div>
                    <div class="small text-body-secondary">
                      {{ fullDay(c.from) }} – {{ fullDay(c.to) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-md-4">
                <div class="card h-100">
                  <div class="card-body">
                    <div class="small text-body-secondary">Change</div>
                    <div class="h4 mb-0">{{ change() }}</div>
                  </div>
                </div>
              </div>
            }
          </div>

          @if (r.period.buckets.length > 1) {
            <section class="card mb-3" aria-labelledby="custom-chart">
              <div class="card-body">
                <h3 id="custom-chart" class="h6">
                  {{ subject() }}, by {{ r.grouping === 'Week' ? 'week' : 'month' }}
                </h3>
                <app-health-trend
                  [kind]="r.metric.unit === 'Percent' || r.metric.unit === 'Score' ? 'line' : 'bar'"
                  [labels]="labels()"
                  [series]="series()"
                  [format]="value"
                  [range]="
                    r.metric.unit === 'Percent'
                      ? [0, 100]
                      : r.metric.unit === 'Score'
                        ? [0, 10]
                        : null
                  "
                  [summary]="summary()"
                />
                <p class="small text-body-secondary mt-2 mb-0">{{ summary() }}</p>
              </div>
            </section>
          }

          <app-data-grid
            name="report-custom"
            [rows]="rows()"
            [columns]="columns()"
            [phoneColumns]="['from', 'value']"
            [rowId]="rowId"
            [noun]="[
              r.grouping === 'Week' ? 'week' : 'month',
              r.grouping === 'Week' ? 'weeks' : 'months',
            ]"
            [clickable]="false"
          />
        } @else if (running()) {
          <p class="text-body-secondary">Working it out…</p>
        } @else {
          <p class="text-body-secondary">
            Pick something to count and press Show. Each week or month is counted by the same code
            as the report tabs, so the numbers agree with them.
          </p>
        }
      </div>
    </div>
  `,
})
export class CustomReport {
  private readonly reportsService = inject(ReportsService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();
  /** `?saved=<id>`: the saved report open in the builder. */
  readonly saved = input<string | undefined>();

  protected readonly compares: CustomCompare[] = ['None', 'PreviousPeriod', 'PreviousYear'];
  protected readonly compareLabels = COMPARE_LABELS;

  private readonly allMetrics = toSignal(this.reportsService.customMetrics(), { initialValue: [] });
  private readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly tags = toSignal(inject(TagsService).list(), { initialValue: [] });
  protected readonly savedList = signal<SavedReport[]>([]);
  protected readonly savedFailed = signal(false);
  protected readonly result = signal<CustomReportResult | null>(null);
  protected readonly runFailed = signal<string | null>(null);
  protected readonly running = signal(false);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);

  protected readonly form = this.fb.group({
    metric: this.fb.nonNullable.control('', Validators.required),
    lifeAreaId: this.fb.control<number | null>(null),
    tagId: this.fb.control<number | null>(null),
    grouping: this.fb.nonNullable.control<CustomGrouping>('Month'),
    compare: this.fb.nonNullable.control<CustomCompare>('None'),
    name: this.fb.nonNullable.control(''),
  });
  private readonly metricKey = toSignal(this.form.controls.metric.valueChanges, {
    initialValue: '',
  });

  private readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));
  protected readonly savedId = computed(() => {
    const id = Number(this.saved());
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  /** Metrics of switched-off modules aren't offered. */
  protected readonly metrics = computed(() => {
    const hidden = this.settings.hiddenModules();
    return this.allMetrics().filter((m) => !m.module || !hidden.has(m.module));
  });
  protected readonly metric = computed<CustomMetric | undefined>(() =>
    this.allMetrics().find((m) => m.key === this.metricKey()),
  );
  protected readonly areas = computed(() =>
    pickableLifeAreas(
      this.lifeAreas(),
      this.settings.hiddenLifeAreaIds(),
      this.form.controls.lifeAreaId.value,
    ),
  );
  protected readonly rangeWords = computed(() => {
    const preset = presetOf(this.range(), todayIso());
    const label = REPORT_PRESETS.find((p) => p.key === preset)?.label.toLowerCase();
    return label
      ? `${label} (moves with the date when saved)`
      : `${this.fullDay(this.range().from)} – ${this.fullDay(this.range().to)}`;
  });

  protected readonly day = (iso: string) => formatDate(iso, APP_DAY_MONTH_FORMAT, this.locale);
  protected readonly fullDay = (iso: string) => formatDate(iso, APP_DATE_FORMAT, this.locale);
  /** A metric's number in its unit. */
  protected readonly value = (v: number | null): string => {
    const r = this.result();
    if (v === null || !r) {
      return '—';
    }
    switch (r.metric.unit) {
      case 'Percent':
        return `${v}%`;
      case 'Minutes':
        return formatMinutes(Math.round(v));
      case 'Money':
        return formatMoney(v, r.currency ?? 'XXX');
      case 'Score':
        return `${v.toFixed(1)}/10`;
      default:
        return String(v);
    }
  };

  protected readonly subject = computed(() => {
    const r = this.result();
    if (!r) {
      return '';
    }
    const filter = r.lifeAreaName ?? r.tagName;
    return filter ? `${r.metric.label} · ${filter}` : r.metric.label;
  });
  protected readonly printTitle = computed(() => this.subject() || 'Custom report');
  protected readonly change = computed(() => {
    const r = this.result();
    if (!r || r.change === null) {
      return '—';
    }
    const sign = r.change > 0 ? '+' : r.change < 0 ? '−' : '';
    const amount = this.value(Math.abs(r.change));
    return r.metric.unit === 'Percent' ? `${sign}${Math.abs(r.change)} points` : `${sign}${amount}`;
  });

  private bucketLabel(iso: string): string {
    return this.result()?.grouping === 'Month'
      ? formatDate(iso, 'MMM yyyy', this.locale)
      : this.day(iso);
  }

  protected readonly labels = computed(
    () => this.result()?.period.buckets.map((b) => this.bucketLabel(b.from)) ?? [],
  );
  protected readonly series = computed<TrendSeries[]>(() => {
    const r = this.result();
    if (!r) {
      return [];
    }
    const now: TrendSeries = { label: 'This period', values: r.period.buckets.map((b) => b.value) };
    return r.compared
      ? [
          now,
          {
            label: 'Compared with',
            values: r.period.buckets.map((_, i) => r.compared!.buckets[i]?.value ?? null),
          },
        ]
      : [{ ...now, label: r.metric.label }];
  });
  protected readonly summary = computed(() => {
    const r = this.result();
    if (!r) {
      return '';
    }
    const counted = r.period.buckets.filter((b) => b.value !== null);
    if (counted.length === 0) {
      return 'Nothing to count in this range.';
    }
    const top = counted.reduce((a, b) => (b.value! > a.value! ? b : a));
    const base = `${this.subject()}: ${this.value(r.period.total)} over the period; highest ${this.value(top.value)} (${this.bucketLabel(top.from)}).`;
    return r.compared ? `${base} Compared with ${this.value(r.compared.total)} before.` : base;
  });

  protected readonly rows = computed<BucketRow[]>(() => {
    const r = this.result();
    if (!r) {
      return [];
    }
    return r.period.buckets.map((b, i) => {
      const c = r.compared?.buckets[i];
      return {
        index: i,
        from: b.from,
        to: b.to,
        value: b.value,
        comparedFrom: c?.from ?? null,
        comparedTo: c?.to ?? null,
        compared: c?.value ?? null,
      };
    });
  });
  protected readonly rowId = (row: BucketRow) => row.index;
  protected readonly columns = computed<ColDef<BucketRow>[]>(() => {
    const r = this.result();
    const label = (iso: string | null) => (iso ? this.bucketLabel(iso) : '');
    const cols: ColDef<BucketRow>[] = [
      {
        headerName: r?.grouping === 'Week' ? 'Week from' : 'Month',
        field: 'from',
        flex: 1,
        minWidth: 120,
        valueFormatter: (p) => label(p.value as string),
      },
      {
        headerName: r?.metric.label ?? 'Value',
        field: 'value',
        flex: 1,
        minWidth: 120,
        type: 'rightAligned',
        valueFormatter: (p) => this.value((p.value as number | null) ?? null),
        context: { csv: (row: BucketRow) => (row.value === null ? '' : String(row.value)) },
      },
    ];
    if (r?.compared) {
      cols.push(
        {
          headerName: 'Compared with',
          field: 'comparedFrom',
          flex: 1,
          minWidth: 120,
          valueFormatter: (p) => label(p.value as string | null),
        },
        {
          headerName: 'Then',
          field: 'compared',
          flex: 1,
          minWidth: 110,
          type: 'rightAligned',
          valueFormatter: (p) => this.value((p.value as number | null) ?? null),
          context: { csv: (row: BucketRow) => (row.compared === null ? '' : String(row.compared)) },
        },
      );
    }
    return cols;
  });

  constructor() {
    this.loadSaved();
    // A filter the new metric doesn't take is cleared.
    effect(() => {
      const m = this.metric();
      untracked(() => {
        if (!m || (m.filter !== 'LifeArea' && m.filter !== 'LifeAreaRequired')) {
          if (this.form.controls.lifeAreaId.value !== null) {
            this.form.controls.lifeAreaId.setValue(null);
          }
        }
        if (m?.filter !== 'Tag' && this.form.controls.tagId.value !== null) {
          this.form.controls.tagId.setValue(null);
        }
      });
    });
    // Opening a saved report fills the builder and runs it (its own range is put in the URL by savedParams).
    effect(() => {
      const id = this.savedId();
      const list = this.savedList();
      untracked(() => {
        const report = id ? list.find((r) => r.id === id) : null;
        if (report) {
          this.form.reset({
            metric: report.metric,
            lifeAreaId: report.lifeAreaId,
            tagId: report.tagId,
            grouping: report.grouping,
            compare: report.compare,
            name: report.name,
          });
          this.runSaved(report.id);
        } else if (!id) {
          this.result.set(null);
          this.form.controls.name.setValue('');
        }
      });
    });
  }

  /** The URL that opens a saved report: its id plus its own days as the page range. */
  protected savedParams(report: SavedReport): Record<string, string | number> {
    const range: ReportRange = report.rangePreset
      ? presetRange(report.rangePreset as ReportPreset, todayIso())
      : { from: report.from!, to: report.to! };
    return { saved: report.id, ...range };
  }

  protected fieldError(name: 'metric' | 'lifeAreaId' | 'name'): string | null {
    if (!this.attempted()) {
      return null;
    }
    switch (name) {
      case 'metric':
        return this.form.controls.metric.value ? null : 'Pick something to count.';
      case 'lifeAreaId':
        return this.metric()?.filter === 'LifeAreaRequired' &&
          this.form.controls.lifeAreaId.value === null
          ? 'Pick the life area.'
          : null;
      case 'name':
        return this.saving() || !this.nameAttempted()
          ? null
          : this.form.controls.name.value.trim()
            ? null
            : 'Give it a name to save it.';
    }
  }

  private readonly nameAttempted = signal(false);

  private definition(): CustomReportDefinition {
    const v = this.form.getRawValue();
    const range = this.range();
    const preset = presetOf(range, todayIso());
    return {
      metric: v.metric,
      lifeAreaId: v.lifeAreaId,
      tagId: v.tagId,
      grouping: v.grouping,
      compare: v.compare,
      rangePreset: preset,
      from: preset ? null : range.from,
      to: preset ? null : range.to,
    };
  }

  private valid(): boolean {
    this.attempted.set(true);
    return !this.fieldError('metric') && !this.fieldError('lifeAreaId');
  }

  protected run(): void {
    if (!this.valid()) {
      return;
    }
    this.show(this.reportsService.runCustom(this.definition()));
  }

  private runSaved(id: number): void {
    this.show(this.reportsService.runSaved(id));
  }

  private show(call: ReturnType<ReportsService['runCustom']>): void {
    this.running.set(true);
    this.runFailed.set(null);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.result.set(result);
        this.running.set(false);
      },
      error: (err) => {
        this.running.set(false);
        this.runFailed.set(apiErrorMessage(err, "Couldn't work the report out."));
      },
    });
  }

  protected save(): void {
    this.nameAttempted.set(true);
    const name = this.form.controls.name.value.trim();
    if (!this.valid() || !name) {
      this.attempted.set(true);
      return;
    }
    this.saving.set(true);
    const id = this.savedId();
    this.reportsService
      .saveReport(id, { ...this.definition(), name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.saving.set(false);
          this.toast.success(id ? 'Saved changes.' : `Saved “${report.name}”.`);
          this.loadSaved();
          void this.router.navigate([], {
            queryParams: { saved: report.id },
            queryParamsHandling: 'merge',
          });
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the report.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const id = this.savedId();
    const report = this.savedList().find((r) => r.id === id);
    if (!id || !report) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete “${report.name}”?`,
      text: 'Only the saved definition goes — nothing it counted is touched.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.reportsService.removeReport(id).subscribe({
      next: () => {
        this.loadSaved();
        void this.router.navigate([], {
          queryParams: { saved: null },
          queryParamsHandling: 'merge',
        });
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }

  private loadSaved(): void {
    this.reportsService
      .savedReports()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.savedList.set(list);
          this.savedFailed.set(false);
        },
        error: () => this.savedFailed.set(true),
      });
  }
}
