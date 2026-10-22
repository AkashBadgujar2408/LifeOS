import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { PrintService } from '../../core/services/print.service';
import { ReportRange } from '../../core/services/reports.service';
import { SettingsService } from '../../core/services/settings.service';
import {
  REPORT_PRESETS,
  ReportPreset,
  presetOf,
  presetRange,
  rangeError,
  readRange,
} from './report-range';
import { REPORT_TABS } from './report-view';

/**
 * Reports (Session 90): one range for every report — in the URL (`?from=&to=`), so it survives switching tabs, a
 * reload and printing — picked from presets or two dates, a tab per report, and a Print button that puts every row
 * of every table on paper. Money reports stay on their own page (`/finance/reports`), linked from here.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    NgbInputDatepicker,
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1">Reports</h1>
          <p class="text-body-secondary mb-0 small">
            {{ range().from | date }} – {{ range().to | date }}
          </p>
        </div>
        <button type="button" class="btn btn-outline-secondary" (click)="print()">
          <i class="bi bi-printer"></i> Print
        </button>
      </div>

      <section class="card mb-3 d-print-none" aria-label="Report range">
        <div class="card-body d-flex flex-wrap align-items-start gap-3">
          <div class="d-flex flex-wrap gap-1" role="group" aria-label="Quick ranges">
            @for (p of presets; track p.key) {
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="preset() === p.key"
                [class.btn-outline-secondary]="preset() !== p.key"
                [attr.aria-pressed]="preset() === p.key"
                (click)="pick(p.key)"
              >
                {{ p.label }}
              </button>
            }
          </div>
          <form
            [formGroup]="form"
            (ngSubmit)="apply()"
            class="d-flex flex-wrap align-items-start gap-2 ms-lg-auto"
            novalidate
          >
            <div>
              <label class="visually-hidden" for="report-from">From</label>
              <div class="input-group input-group-sm" style="max-width: 11rem">
                <input
                  id="report-from"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('from')"
                  formControlName="from"
                  placeholder="From, e.g. 01/Jan/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #fromPicker="ngbDatepicker"
                  [minDate]="minDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick the first day"
                  (click)="fromPicker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('from'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div>
              <label class="visually-hidden" for="report-to">To</label>
              <div class="input-group input-group-sm" style="max-width: 11rem">
                <input
                  id="report-to"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('to')"
                  formControlName="to"
                  placeholder="To, e.g. 31/Dec/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #toPicker="ngbDatepicker"
                  [minDate]="minDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick the last day"
                  (click)="toPicker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('to'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <button type="submit" class="btn btn-sm btn-outline-primary">Show</button>
          </form>
        </div>
      </section>

      <ul class="nav nav-tabs mb-3 d-print-none">
        @for (tab of tabs; track tab.path) {
          @if (!hidden().has(tab.module)) {
            <li class="nav-item">
              <a
                class="nav-link"
                [routerLink]="['/reports', tab.path]"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                queryParamsHandling="preserve"
                >{{ tab.label }}</a
              >
            </li>
          }
        }
        @if (!hidden().has('Finance')) {
          <li class="nav-item">
            <a class="nav-link" routerLink="/finance/reports">
              Money <i class="bi bi-box-arrow-up-right small" aria-hidden="true"></i>
            </a>
          </li>
        }
      </ul>

      <router-outlet />
    </div>
  `,
})
export class Reports {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly printService = inject(PrintService);

  /** From the `?from=&to=` query parameters. */
  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();

  protected readonly presets = REPORT_PRESETS;
  protected readonly tabs = REPORT_TABS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly hidden = inject(SettingsService).hiddenModules;
  protected readonly range = computed(() => readRange(this.from(), this.to(), todayIso()));
  protected readonly preset = computed(() => presetOf(this.range(), todayIso()));
  protected readonly attempted = signal(false);

  protected readonly form = this.fb.group({
    from: this.fb.control<string | null>(null, Validators.required),
    to: this.fb.control<string | null>(null, Validators.required),
  });

  constructor() {
    // The boxes always show the range in use (a preset fills them too).
    effect(() => {
      const { from, to } = this.range();
      this.form.setValue({ from, to }, { emitEvent: false });
      this.attempted.set(false);
    });
  }

  protected pick(preset: ReportPreset): void {
    this.go(presetRange(preset, todayIso()));
  }

  protected fieldError(name: 'from' | 'to'): string | null {
    const control = this.form.controls[name];
    if (!(control.touched || this.attempted())) {
      return null;
    }
    if (control.errors) {
      return (
        dateFieldError(control.errors) ??
        (name === 'from' ? 'Pick the first day.' : 'Pick the last day.')
      );
    }
    const { from, to } = this.form.getRawValue();
    return name === 'to' && from && to ? rangeError({ from, to }) : null;
  }

  protected apply(): void {
    this.attempted.set(true);
    const { from, to } = this.form.getRawValue();
    if (this.form.invalid || !from || !to || rangeError({ from, to })) {
      return;
    }
    this.go({ from, to });
  }

  protected print(): void {
    void this.printService.print();
  }

  private go(range: ReportRange): void {
    void this.router.navigate([], { queryParams: range, queryParamsHandling: 'merge' });
  }
}
