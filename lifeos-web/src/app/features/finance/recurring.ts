import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FinanceService, RecurringTransaction } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { recurrenceSummary } from '../calendar/event-recurrence';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { TRANSACTION_KIND_ICONS, formatMoney } from './finance-view';
import { openRecurringEditor } from './recurring-editor';

/** Salary, rent, EMIs, subscriptions: what repeats, when it next writes, paused ones last. */
@Component({
  selector: 'app-finance-recurring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, BaseCurrencyPrompt],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Repeating</h1>
          <p class="text-body-secondary mb-0 small">
            Salary, rent, EMIs, subscriptions — each written into the ledger on its day.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add repeating
        </button>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !schedules()) {
        <app-load-error message="Couldn't load your repeating transactions." (retry)="load()" />
      } @else if (schedules(); as schedules) {
        @if (schedules.length === 0) {
          <p class="text-body-secondary">
            Nothing repeating yet. Add your salary and your rent, and they'll fill themselves in.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (s of schedules; track s.id) {
                <li class="list-group-item py-3" [class.text-body-secondary]="s.isPaused">
                  <div class="d-flex gap-3 align-items-start">
                    <i class="bi {{ kindIcons[s.kind] }} mt-1" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(s)"
                      >
                        {{ s.name }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ summary(s) }}
                        · {{ s.kind === 'Income' ? s.toAccountName : s.fromAccountName }}
                        @if (s.kind === 'Transfer') {
                          → {{ s.toAccountName }}
                        }
                      </div>
                      <div class="small">
                        @if (s.isPaused) {
                          Paused
                        } @else if (s.nextOn) {
                          Next on {{ s.nextOn | date }}
                        } @else {
                          Finished
                        }
                        <span class="text-body-secondary">
                          · {{ s.generatedCount }} written so far
                          @for (t of s.tags; track t.id) {
                            · {{ t.name }}
                          }
                        </span>
                      </div>
                    </div>
                    <div class="text-end fw-semibold text-nowrap">
                      {{ s.kind === 'Income' ? '+' : '' }}{{ money(s.amount, s.currency) }}
                    </div>
                  </div>
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
export class FinanceRecurring {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindIcons = TRANSACTION_KIND_ICONS;
  protected readonly money = formatMoney;
  protected readonly schedules = signal<RecurringTransaction[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected summary(s: RecurringTransaction): string {
    return recurrenceSummary(
      { frequency: s.recurrenceFrequency, interval: s.recurrenceInterval, until: s.until },
      s.startDate,
    );
  }

  protected load(): void {
    this.financeService
      .recurring()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schedules) => {
          this.schedules.set(schedules);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(schedule?: RecurringTransaction): Promise<void> {
    const result = await openRecurringEditor(this.modal, schedule);
    if (result) {
      this.toast.success(
        result.kind === 'saved' ? 'Repeating transaction saved.' : 'Repeating transaction deleted.',
      );
      this.load();
    }
  }
}
