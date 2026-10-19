import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService, TaxItem } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { TAX_ITEM_KIND_LABELS, formatMoney, taxDueDays, taxYearGroups } from './finance-view';
import { openTaxItemEditor } from './tax-item-editor';

/** Things for the taxman, by tax year: deadlines (on the calendar too), deductions with their total, payments, forms. */
@Component({
  selector: 'app-finance-taxes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Taxes</h1>
          <p class="text-body-secondary mb-0 small">
            Deadlines, deductions and forms, year by year. Due days show on your calendar.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add tax item
        </button>
      </div>

      @if (loadFailed() && !items()) {
        <app-load-error message="Couldn't load your tax items." (retry)="load()" />
      } @else if (items(); as items) {
        @if (items.length === 0) {
          <p class="text-body-secondary">
            Nothing yet. Add the return's filing deadline, or a deduction you mean to claim.
          </p>
        } @else {
          <div class="d-flex flex-column gap-4">
            @for (g of groups(); track g.taxYear) {
              <section class="card">
                <div
                  class="card-header d-flex flex-wrap align-items-baseline justify-content-between gap-2"
                >
                  <h2 class="h6 mb-0">{{ g.taxYear ?? 'No tax year' }}</h2>
                  <span class="small text-body-secondary">
                    {{ g.open === 0 ? 'All done' : g.open + ' open' }}
                    @if (g.deductible.length) {
                      · deductions
                      @for (d of g.deductible; track d.currency; let last = $last) {
                        <strong class="text-body">{{ money(d.total, d.currency) }}</strong
                        >{{ last ? '' : ' + ' }}
                      }
                    }
                  </span>
                </div>
                <ul class="list-group list-group-flush">
                  @for (t of g.items; track t.id) {
                    @let days = dueDays(t);
                    <li class="list-group-item d-flex gap-3 align-items-start">
                      <input
                        type="checkbox"
                        class="form-check-input mt-1 flex-shrink-0"
                        [checked]="!!t.doneOn"
                        [attr.aria-label]="(t.doneOn ? 'Reopen ' : 'Mark done: ') + t.title"
                        (change)="toggle(t)"
                      />
                      <div class="min-w-0 flex-grow-1" [class.text-body-secondary]="t.doneOn">
                        <button
                          type="button"
                          class="btn btn-link p-0 link-body-emphasis text-decoration-none text-start text-break"
                          [class.text-decoration-line-through]="t.doneOn"
                          (click)="edit(t)"
                        >
                          {{ t.title }}
                        </button>
                        <div class="small text-body-secondary">
                          {{ kindLabels[t.kind] }}
                          @if (t.isDeductible) {
                            · <span class="badge text-bg-light border">Deductible</span>
                          }
                          @if (t.transactionId) {
                            · <i class="bi bi-receipt" aria-hidden="true"></i>
                            {{ t.transactionPayee ?? 'Transaction' }}, {{ t.transactionOn | date }}
                          }
                        </div>
                        <div class="small">
                          @if (t.doneOn) {
                            Done {{ t.doneOn | date }}
                          } @else if (t.dueOn) {
                            <span
                              [class.text-danger-emphasis]="days !== null && days < 0"
                              [class.fw-semibold]="days !== null && days >= 0 && days <= 14"
                            >
                              Due {{ t.dueOn | date }}
                              @if (days !== null) {
                                ({{
                                  days < 0
                                    ? -days + (days === -1 ? ' day' : ' days') + ' late'
                                    : days === 0
                                      ? 'today'
                                      : days + (days === 1 ? ' day' : ' days') + ' left'
                                }})
                              }
                            </span>
                          }
                        </div>
                      </div>
                      @if (t.amount !== null && t.currency) {
                        <div class="text-end fw-semibold text-nowrap">
                          {{ money(t.amount, t.currency) }}
                        </div>
                      }
                    </li>
                  }
                </ul>
                <div class="card-footer bg-transparent">
                  <button
                    type="button"
                    class="btn btn-sm btn-link px-0"
                    (click)="edit(undefined, g.taxYear)"
                  >
                    <i class="bi bi-plus"></i> Add to {{ g.taxYear ?? 'this list' }}
                  </button>
                </div>
              </section>
            }
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceTaxes {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = TAX_ITEM_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly items = signal<TaxItem[] | null>(null);
  protected readonly groups = computed(() => taxYearGroups(this.items() ?? []));
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  constructor() {
    this.load();
  }

  protected dueDays(item: TaxItem): number | null {
    return taxDueDays(item, this.today);
  }

  protected load(): void {
    this.financeService
      .taxItems()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected toggle(item: TaxItem): void {
    this.financeService.setTaxItemDone(item.id, !item.doneOn).subscribe({
      next: (updated) =>
        this.items.update((list) => list?.map((i) => (i.id === updated.id ? updated : i)) ?? null),
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Could not update the tax item.'));
        this.load();
      },
    });
  }

  protected async edit(item?: TaxItem, taxYear?: string | null): Promise<void> {
    const result = await openTaxItemEditor(this.modal, item, taxYear);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Tax item saved.' : 'Tax item deleted.');
    }
  }
}
