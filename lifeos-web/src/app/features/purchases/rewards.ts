import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { Benefit, PurchasesService, RewardsSummary } from '../../core/services/purchases.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openBenefitDetail } from './benefit-detail';
import { openBenefitEditor } from './benefit-editor';
import {
  BENEFIT_KIND_ICONS,
  BENEFIT_KIND_LABELS,
  benefitWorth,
  groupRewards,
} from './purchases-view';

/**
 * Rewards & vouchers: what you can still spend (vouchers, gift cards, credit, coupons — running out soonest first),
 * cashback still to come, points by programme, and what was used up or ran out. Totals: usable now, lost to expiry
 * this year, cashback earned this year.
 */
@Component({
  selector: 'app-rewards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Rewards & vouchers</h1>
          <p class="text-body-secondary mb-0 small">
            Gift cards, vouchers, coupons, cashback and points — so none of it runs out unused.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="add()">
          <i class="bi bi-plus-lg"></i> Add a reward
        </button>
      </div>

      @if (loadFailed() && !benefits()) {
        <app-load-error message="Couldn't load your rewards." (retry)="load()" />
      } @else if (benefits(); as all) {
        @if (summary(); as s) {
          <div class="row g-3 mb-4">
            @for (tile of tiles(); track tile.label) {
              <div class="col-sm-4">
                <section class="card h-100">
                  <div class="card-body">
                    <h2 class="h6 text-body-secondary mb-1">{{ tile.label }}</h2>
                    @for (m of tile.amounts; track m.currency) {
                      <div class="fs-5 fw-semibold">{{ money(m.amount, m.currency) }}</div>
                    } @empty {
                      <div class="fs-5 fw-semibold">—</div>
                    }
                    <div class="small text-body-secondary">{{ tile.note }}</div>
                  </div>
                </section>
              </div>
            }
          </div>
        }

        @if (all.length === 0) {
          <p class="text-body-secondary">
            Nothing yet. Add a gift card, a voucher or a points programme — you'll be reminded
            before it runs out, and offered it when you record a purchase at that store.
          </p>
        } @else {
          <section class="mb-4" aria-labelledby="rewards-usable">
            <h2 id="rewards-usable" class="h5 mb-3">Usable now</h2>
            <ng-container
              *ngTemplateOutlet="
                rows;
                context: { $implicit: groups().usable, empty: 'Nothing to spend right now.' }
              "
            />
          </section>
          @if (groups().cashback.length) {
            <section class="mb-4" aria-labelledby="rewards-cashback">
              <h2 id="rewards-cashback" class="h5 mb-3">Cashback to come</h2>
              <ng-container *ngTemplateOutlet="rows; context: { $implicit: groups().cashback }" />
            </section>
          }
          @if (groups().points.length) {
            <section class="mb-4" aria-labelledby="rewards-points">
              <h2 id="rewards-points" class="h5 mb-3">Points</h2>
              <ng-container *ngTemplateOutlet="rows; context: { $implicit: groups().points }" />
            </section>
          }
          @if (groups().finished.length) {
            <details class="mb-4">
              <summary class="h6">
                Used up, ran out or received ({{ groups().finished.length }})
              </summary>
              <div class="mt-2">
                <ng-container *ngTemplateOutlet="rows; context: { $implicit: groups().finished }" />
              </div>
            </details>
          }
        }

        <ng-template #rows let-list let-empty="empty">
          @if (list.length === 0) {
            <p class="small text-body-secondary">{{ empty }}</p>
          } @else {
            <div class="card">
              <ul class="list-group list-group-flush">
                @for (b of asBenefits(list); track b.id) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap gap-2 align-items-start">
                      <i class="bi {{ icons[b.kind] }} mt-1" aria-hidden="true"></i>
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                          (click)="show(b)"
                        >
                          {{ b.name }}
                        </button>
                        <div class="small text-body-secondary">
                          {{ labels[b.kind] }}
                          @if (b.store) {
                            · {{ b.store }}
                          }
                          @if (b.hasCode) {
                            · <i class="bi bi-key" aria-hidden="true"></i> code saved
                          }
                        </div>
                      </div>
                      <div class="text-end small">
                        <div class="fw-semibold">{{ worth(b) }}</div>
                        @if (b.status === 'Pending' && b.expectedBy) {
                          <div
                            [class.text-danger-emphasis]="b.overdue"
                            [class.fw-semibold]="b.overdue"
                          >
                            {{ b.overdue ? 'overdue since' : 'by' }} {{ b.expectedBy | date }}
                          </div>
                        } @else if (b.status === 'Usable' && b.nextExpiry) {
                          <div
                            [class.text-danger-emphasis]="b.expiringSoon"
                            [class.fw-semibold]="b.expiringSoon"
                          >
                            runs out {{ b.nextExpiry | date }}
                          </div>
                        } @else if (b.status === 'Expired') {
                          <div class="text-body-secondary">
                            ran out {{ b.lostOn | date }}
                            @if (b.lost > 0) {
                              — {{ money(b.lost, b.currency ?? 'INR') }} unused
                            }
                          </div>
                        } @else if (b.status === 'UsedUp') {
                          <div class="text-body-secondary">used up</div>
                        } @else if (b.status === 'Received') {
                          <div class="text-body-secondary">received {{ b.receivedOn | date }}</div>
                        }
                      </div>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }
        </ng-template>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Rewards {
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** `?open=<id>` (from search or a reminder) opens that reward. */
  readonly open = input<string>();

  protected readonly money = formatMoney;
  protected readonly worth = benefitWorth;
  protected readonly labels = BENEFIT_KIND_LABELS;
  protected readonly icons = BENEFIT_KIND_ICONS;
  protected readonly benefits = signal<Benefit[] | null>(null);
  protected readonly summary = signal<RewardsSummary | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() => groupRewards(this.benefits() ?? []));
  protected readonly tiles = computed(() => {
    const s = this.summary();
    return s
      ? [
          { label: 'Usable now', amounts: s.usable, note: 'vouchers, cards, credit and points' },
          {
            label: 'Ran out unused this year',
            amounts: s.lostThisYear,
            note: 'money lost to expiry',
          },
          { label: 'Cashback this year', amounts: s.cashbackThisYear, note: 'received' },
        ]
      : [];
  });

  constructor() {
    effect(() => {
      const id = Number(this.open());
      if (id) {
        untracked(() => {
          void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
          void this.openById(id);
        });
      }
    });
    this.load();
  }

  /** The template's rows are typed through this (ng-template contexts aren't). */
  protected asBenefits(list: unknown): Benefit[] {
    return list as Benefit[];
  }

  protected load(): void {
    const today = todayIso();
    forkJoin([this.purchasesService.benefits(today), this.purchasesService.rewardsSummary(today)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([benefits, summary]) => {
          this.benefits.set(benefits);
          this.summary.set(summary);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async add(): Promise<void> {
    const created = await openBenefitEditor(this.modal);
    if (created) {
      this.load();
      this.toast.success('Reward saved.');
    }
  }

  protected async show(benefit: Benefit): Promise<void> {
    await this.openById(benefit.id);
  }

  private async openById(id: number): Promise<void> {
    if (await openBenefitDetail(this.modal, id)) {
      this.load();
    }
  }
}
