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
import { FinanceService, Holding } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { HOLDING_KIND_LABELS, formatMoney, totalsByCurrency } from './finance-view';
import { openHoldingEditor } from './holding-editor';

/** What you own that changes value: worth today (latest valuation), what went in, the gain; sold ones last. */
@Component({
  selector: 'app-finance-investments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, BaseCurrencyPrompt],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Investments</h1>
          <p class="text-body-secondary mb-0 small">
            Shares, funds, gold, PPF, deposits — valued by hand, no live prices.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add investment
        </button>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !holdings()) {
        <app-load-error message="Couldn't load your investments." (retry)="load()" />
      } @else if (holdings(); as holdings) {
        @if (holdings.length === 0) {
          <p class="text-body-secondary">
            No investments yet. Add the fund, the gold, the deposit — and what it's worth now and
            then.
          </p>
        } @else {
          @if (totals().length > 0) {
            <div class="d-flex flex-wrap gap-4 mb-3">
              @for (t of totals(); track t.currency) {
                <div>
                  <div class="small text-body-secondary">Worth today ({{ t.currency }})</div>
                  <div class="h4 mb-0">{{ money(t.total, t.currency) }}</div>
                </div>
              }
            </div>
          }
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (h of holdings; track h.id) {
                <li class="list-group-item py-3" [class.text-body-secondary]="h.disposedOn">
                  <div class="d-flex gap-3 align-items-start">
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(h)"
                      >
                        {{ h.name }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[h.kind] }}
                        @if (h.interestRate !== null) {
                          · {{ h.interestRate }}%
                        }
                        @if (h.maturesOn) {
                          · matures {{ h.maturesOn | date }}
                        }
                        @if (h.disposedOn) {
                          · sold/closed {{ h.disposedOn | date }}
                        } @else if (h.valuations.length > 0) {
                          · valued {{ h.valuations[0].valuedOn | date }}
                        } @else {
                          · not valued yet
                        }
                      </div>
                    </div>
                    <div class="text-end">
                      @if (h.currentValue !== null) {
                        <div class="fw-semibold">{{ money(h.currentValue, h.currency) }}</div>
                      }
                      @if (h.gain !== null && h.investedAmount !== null && h.investedAmount > 0) {
                        <div class="small text-body-secondary">
                          {{ h.gain >= 0 ? 'up' : 'down' }} {{ money(abs(h.gain), h.currency) }} on
                          {{ money(h.investedAmount, h.currency) }}
                        </div>
                      }
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
export class FinanceInvestments {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = HOLDING_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly abs = Math.abs;
  protected readonly holdings = signal<Holding[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly totals = computed(() =>
    totalsByCurrency(
      (this.holdings() ?? [])
        .filter((h) => h.currentValue !== null)
        .map((h) => ({ currency: h.currency, balance: h.currentValue! })),
    ),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.financeService
      .holdings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (holdings) => {
          this.holdings.set(holdings);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(holding?: Holding): Promise<void> {
    const result = await openHoldingEditor(this.modal, holding);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Investment saved.' : 'Investment deleted.');
      this.load();
    }
  }
}
