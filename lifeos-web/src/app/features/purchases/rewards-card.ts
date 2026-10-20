import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { todayIso } from '../../core/dates/today';
import { Benefit, PurchasesService } from '../../core/services/purchases.service';
import { benefitWorth } from './purchases-view';

/**
 * My Day's rewards card: vouchers, coupons or points running out within 30 days, and cashback that's overdue. Nothing
 * at all when there's nothing to act on. Fetches itself, like the medicines card.
 */
@Component({
  selector: 'app-rewards-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    @if (items().length) {
      <section class="card" aria-labelledby="rewards-card-heading">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 id="rewards-card-heading" class="h5 mb-0">
              <i class="bi bi-gift" aria-hidden="true"></i> Rewards to use
            </h2>
            <a class="small" routerLink="/purchases/rewards">All rewards</a>
          </div>
          <ul class="list-unstyled mb-0 small">
            @for (b of items(); track b.id) {
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
          </ul>
        </div>
      </section>
    }
  `,
})
export class RewardsCard {
  private readonly purchasesService = inject(PurchasesService);

  protected readonly worth = benefitWorth;
  protected readonly items = signal<Benefit[]>([]);

  constructor() {
    this.purchasesService
      .rewardsAttention(todayIso())
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      // A failure just leaves the card out; My Day has its own load error.
      .subscribe({ next: (items) => this.items.set(items), error: () => this.items.set([]) });
  }
}
