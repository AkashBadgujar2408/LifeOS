import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { todayIso } from '../../core/dates/today';
import { PurchasesAttention, PurchasesService } from '../../core/services/purchases.service';
import { benefitWorth } from './purchases-view';

/**
 * My Day's "don't miss" card for Purchases: rewards running out within 30 days or cashback overdue, subscriptions to
 * decide on within a week, returns due within a week. Nothing at all when there's nothing to act on. Fetches itself
 * (one call), like the medicines card.
 */
@Component({
  selector: 'app-rewards-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    @if (count() > 0 && attention(); as a) {
      <section class="card" aria-labelledby="rewards-card-heading">
        <div class="card-body p-4">
          <h2 id="rewards-card-heading" class="h5 mb-3">
            <i class="bi bi-bag-check" aria-hidden="true"></i> Don't miss
          </h2>
          <ul class="list-unstyled mb-0 small">
            @for (b of a.rewards; track b.id) {
              <li class="d-flex flex-wrap gap-2 justify-content-between mb-2">
                <a
                  class="link-body-emphasis text-decoration-none fw-semibold min-w-0 text-break"
                  routerLink="/purchases/rewards"
                  [queryParams]="{ open: b.id }"
                >
                  {{ b.name }}
                </a>
                <span class="text-body-secondary text-end">
                  {{ worth(b) }} ·
                  @if (b.overdue) {
                    <span class="text-danger-emphasis fw-semibold"
                      >cashback overdue since {{ b.expectedBy | date }}</span
                    >
                  } @else {
                    runs out {{ b.nextExpiry ?? b.expiresOn | date }}
                  }
                </span>
              </li>
            }
            @for (s of a.subscriptions; track s.id) {
              <li class="d-flex flex-wrap gap-2 justify-content-between mb-2">
                <a
                  class="link-body-emphasis text-decoration-none fw-semibold min-w-0 text-break"
                  routerLink="/purchases/subscriptions"
                  [queryParams]="{ open: s.id }"
                >
                  {{ s.name }}
                </a>
                <span class="text-body-secondary text-end"
                  >keep or cancel by {{ s.cancelBy | date }}</span
                >
              </li>
            }
            @for (r of a.returns; track r.id) {
              <li class="d-flex flex-wrap gap-2 justify-content-between mb-2">
                <a
                  class="link-body-emphasis text-decoration-none fw-semibold min-w-0 text-break"
                  routerLink="/purchases/returns"
                  [queryParams]="{ open: r.id }"
                >
                  Return {{ r.purchaseTitle }}
                </a>
                <span class="text-body-secondary text-end">by {{ r.returnBy | date }}</span>
              </li>
            }
          </ul>
        </div>
      </section>
    }
  `,
})
export class RewardsCard {
  private readonly purchasesService = inject(PurchasesService);

  protected readonly worth = benefitWorth;
  protected readonly attention = signal<PurchasesAttention | null>(null);
  protected readonly count = computed(() => {
    const a = this.attention();
    return a ? a.rewards.length + a.subscriptions.length + a.returns.length : 0;
  });

  constructor() {
    this.purchasesService
      .attention(todayIso())
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      // A failure just leaves the card out; My Day has its own load error.
      .subscribe({ next: (a) => this.attention.set(a), error: () => this.attention.set(null) });
  }
}
