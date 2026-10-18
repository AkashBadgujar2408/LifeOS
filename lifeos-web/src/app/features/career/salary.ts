import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { CareerService, Employment, SalaryRecord } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { SALARY_REASON_LABELS, changeText, formatPay } from './career-view';
import { openSalaryEditor } from './salary-editor';

/**
 * Salary history, newest first: what each record paid, why it changed, and the change from the record before it in
 * the same currency and period (computed by the API). Changes are words and signs, not good/bad colours.
 */
@Component({
  selector: 'app-career-salary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Salary history</h1>
          <p class="text-body-secondary mb-0 small">
            What each role paid, and how it moved. Only you can see this.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Record pay
        </button>
      </div>

      @if (loadFailed() && !records()) {
        <app-load-error message="Couldn't load your salary history." (retry)="load()" />
      } @else if (records(); as records) {
        @if (records.length === 0) {
          <p class="text-body-secondary">
            Nothing recorded yet. Start with the pay of your first role — each change after it shows
            how much it moved.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (record of records; track record.id) {
                <li class="list-group-item d-flex flex-wrap justify-content-between gap-2 py-3">
                  <div class="min-w-0">
                    <button
                      type="button"
                      class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start"
                      (click)="edit(record)"
                    >
                      {{ formatPay(record.amount, record.currency, record.period) }}
                    </button>
                    <div class="small text-body-secondary text-break">
                      {{ reasonLabels[record.reason] }} · from {{ record.effectiveOn | date }}
                      @if (record.role) {
                        · {{ record.role }} at {{ record.organisation }}
                      }
                    </div>
                    @if (record.note) {
                      <div class="small text-break">{{ record.note }}</div>
                    }
                  </div>
                  @if (changeText(record.changePercent); as change) {
                    <span
                      class="fw-semibold align-self-center"
                      [attr.aria-label]="'Change ' + change"
                    >
                      @if (record.changePercent! > 0) {
                        <i class="bi bi-arrow-up-short" aria-hidden="true"></i>
                      } @else if (record.changePercent! < 0) {
                        <i class="bi bi-arrow-down-short" aria-hidden="true"></i>
                      }
                      {{ change }}
                    </span>
                  }
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class CareerSalary {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reasonLabels = SALARY_REASON_LABELS;
  protected readonly formatPay = formatPay;
  protected readonly changeText = changeText;
  protected readonly records = signal<SalaryRecord[] | null>(null);
  private readonly roles = signal<Employment[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    forkJoin({
      records: this.careerService.salaryRecords(),
      roles: this.careerService.employments(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ records, roles }) => {
          this.records.set(records);
          this.roles.set(roles);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(record?: SalaryRecord): Promise<void> {
    const result = await openSalaryEditor(
      this.modal,
      this.roles(),
      record,
      this.records()?.[0]?.currency,
    );
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Pay saved.' : 'Pay record deleted.');
      this.load();
    }
  }
}
