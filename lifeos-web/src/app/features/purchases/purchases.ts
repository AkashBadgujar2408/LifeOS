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
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ColDef } from 'ag-grid-community';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import { GridView, ViewToggle } from '../../core/grid/view-toggle';
import { apiErrorMessage } from '../../core/services/api-error';
import { Purchase, PurchasesService } from '../../core/services/purchases.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openPurchaseEditor } from './purchase-editor';
import { estimateSummary, estimateText, groupByMonth, purchaseTotals } from './purchases-view';

type Span = 'month' | 'year' | 'all';

/**
 * Everything you've bought, month by month: what was paid (per currency), where, whether it's in Finance and the
 * inventory, and how it compared with what you expected. Or one table (Session 75a) to sort, page and export.
 */
@Component({
  selector: 'app-purchases',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, DataGrid, ViewToggle],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Purchases</h1>
          <p class="text-body-secondary mb-0 small">
            What you bought, where, and how it compared with what you expected.
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <a routerLink="/purchases/lists" class="btn btn-outline-primary">
            <i class="bi bi-cart3"></i> Shopping lists
          </a>
          <button type="button" class="btn btn-primary" (click)="edit()">
            <i class="bi bi-plus-lg"></i> Record a purchase
          </button>
        </div>
      </div>

      <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div class="btn-group btn-group-sm" role="group" aria-label="Which purchases">
          @for (s of spans; track s.value) {
            <input
              type="radio"
              class="btn-check"
              name="purchase-span"
              [id]="'purchase-span-' + s.value"
              [checked]="span() === s.value"
              (change)="setSpan(s.value)"
            />
            <label class="btn btn-outline-secondary" [for]="'purchase-span-' + s.value">
              {{ s.label }}
            </label>
          }
        </div>
        <label class="visually-hidden" for="purchase-search">Search purchases</label>
        <input
          id="purchase-search"
          type="search"
          class="form-control form-control-sm w-auto"
          placeholder="Search by what or where"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <div class="ms-auto">
          <app-view-toggle
            key="purchases"
            label="Show purchases"
            cardsLabel="By month"
            cardsIcon="bi-calendar3"
            [(view)]="view"
          />
        </div>
      </div>

      @if (loadFailed() && !purchases()) {
        <app-load-error message="Couldn't load your purchases." (retry)="load()" />
      } @else if (purchases(); as all) {
        @if (all.length === 0) {
          <p class="text-body-secondary">
            Nothing here yet. Record a purchase to keep the receipt, put it in Finance and add it to
            your inventory with its warranty — all in one go.
          </p>
        } @else {
          <div class="row g-3 mb-4">
            <div class="col-sm-6">
              <section class="card h-100" aria-labelledby="purchase-total">
                <div class="card-body">
                  <h2 id="purchase-total" class="h6 text-body-secondary mb-1">Spent</h2>
                  @for (t of totals(); track t.currency) {
                    <div class="fs-5 fw-semibold">{{ money(t.amount, t.currency) }}</div>
                  } @empty {
                    <div class="fs-5 fw-semibold">—</div>
                  }
                  <div class="small text-body-secondary">
                    {{ shown().length }} purchase{{ shown().length === 1 ? '' : 's' }}
                  </div>
                </div>
              </section>
            </div>
            <div class="col-sm-6">
              <section class="card h-100" aria-labelledby="purchase-estimates">
                <div class="card-body">
                  <h2 id="purchase-estimates" class="h6 text-body-secondary mb-1">
                    Against what you expected
                  </h2>
                  @for (e of estimates(); track e.currency) {
                    <div class="small">
                      Expected {{ money(e.estimated, e.currency) }}, paid
                      {{ money(e.paid, e.currency) }} —
                      <span
                        [class.text-danger-emphasis]="e.difference > 0"
                        [class.fw-semibold]="e.difference !== 0"
                      >
                        {{
                          e.difference === 0
                            ? 'spot on'
                            : money(e.difference > 0 ? e.difference : -e.difference, e.currency) +
                              (e.difference > 0 ? ' over' : ' under')
                        }}
                      </span>
                    </div>
                  } @empty {
                    <div class="small text-body-secondary">
                      Add what you expected to pay to see how close you were.
                    </div>
                  }
                </div>
              </section>
            </div>
          </div>

          @if (view() === 'table') {
            @if (shown().length) {
              <app-data-grid
                name="purchases"
                [rows]="shown()"
                [columns]="columns"
                [phoneColumns]="['purchasedOn', 'title', 'amount']"
                [rowId]="rowId"
                [noun]="['purchase', 'purchases']"
                (open)="edit($event)"
              />
            } @else {
              <p class="text-body-secondary">Nothing matches.</p>
            }
          } @else {
            @for (month of months(); track month.key) {
              <section class="mb-4" [attr.aria-labelledby]="'purchase-month-' + month.key">
                <div class="d-flex flex-wrap justify-content-between align-items-baseline mb-2">
                  <h2 class="h6 mb-0" [id]="'purchase-month-' + month.key">
                    {{ month.key + '-01' | date: 'MMMM yyyy' }}
                  </h2>
                  <span class="small text-body-secondary">
                    @for (t of month.totals; track t.currency; let last = $last) {
                      {{ money(t.amount, t.currency) }}{{ last ? '' : ' + ' }}
                    }
                  </span>
                </div>
                <div class="card">
                  <ul class="list-group list-group-flush">
                    @for (p of month.purchases; track p.id) {
                      <li class="list-group-item py-3">
                        <div class="d-flex flex-wrap gap-2 align-items-start">
                          <div class="min-w-0 flex-grow-1">
                            <button
                              type="button"
                              class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                              (click)="edit(p)"
                            >
                              {{ p.title }}
                            </button>
                            <div class="small text-body-secondary">
                              {{ p.purchasedOn | date }}
                              @if (p.store) {
                                · {{ p.store }}
                              }
                              @for (t of p.tags; track t.id) {
                                · <span class="badge text-bg-light border">{{ t.name }}</span>
                              }
                            </div>
                            <div class="small text-body-secondary">
                              @if (p.transactionId) {
                                <i class="bi bi-check2-circle" aria-hidden="true"></i> in Finance
                              }
                              @if (p.assetName) {
                                <span class="ms-1">
                                  <i class="bi bi-box-seam" aria-hidden="true"></i> in your
                                  inventory
                                </span>
                              }
                              @if (p.listItemCount) {
                                <span class="ms-1">
                                  <i class="bi bi-cart-check" aria-hidden="true"></i>
                                  {{ p.listItemCount }} from a list
                                </span>
                              }
                              @if (p.wishlistItemName) {
                                <span class="ms-1">
                                  <i class="bi bi-gift" aria-hidden="true"></i> from your wishlist
                                </span>
                              }
                            </div>
                          </div>
                          <div class="text-end small">
                            <div class="fw-semibold">{{ money(p.amount, p.currency) }}</div>
                            @if (estimate(p); as text) {
                              <div class="text-body-secondary">{{ text }}</div>
                            }
                          </div>
                        </div>
                      </li>
                    }
                  </ul>
                </div>
              </section>
            } @empty {
              <p class="text-body-secondary">Nothing matches.</p>
            }
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Purchases {
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /** `?open=<id>` (from search or a reminder) opens that purchase. */
  readonly open = input<string>();

  protected readonly money = formatMoney;
  protected readonly estimate = estimateText;
  protected readonly spans: { value: Span; label: string }[] = [
    { value: 'month', label: 'This month' },
    { value: 'year', label: 'Last 12 months' },
    { value: 'all', label: 'All' },
  ];
  protected readonly span = signal<Span>('year');
  protected readonly query = signal('');
  protected readonly purchases = signal<Purchase[] | null>(null);
  protected readonly loadFailed = signal(false);
  private opened = false;
  protected readonly view = signal<GridView>('cards');
  protected readonly rowId = (p: Purchase) => p.id;
  protected readonly columns: ColDef<Purchase>[] = [
    {
      headerName: 'Day',
      field: 'purchasedOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    { headerName: 'What', field: 'title', flex: 2, minWidth: 160 },
    { headerName: 'Where', field: 'store', flex: 1, minWidth: 120 },
    {
      headerName: 'Paid',
      field: 'amount',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => (p.data ? formatMoney(p.data.amount, p.data.currency) : ''),
    },
    {
      headerName: 'Expected',
      field: 'estimatedAmount',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) =>
        p.data && p.data.estimatedAmount !== null
          ? formatMoney(p.data.estimatedAmount, p.data.currency)
          : '',
    },
    {
      headerName: 'Paid from',
      field: 'paidFromAccountName',
      width: 140,
    },
    { headerName: 'Inventory item', field: 'assetName', width: 150 },
    {
      headerName: 'Tags',
      colId: 'tags',
      flex: 1,
      minWidth: 120,
      valueGetter: (p) => p.data?.tags.map((t) => t.name).join(', ') ?? '',
    },
  ];

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.purchases() ?? [];
    return q
      ? all.filter(
          (p) => p.title.toLowerCase().includes(q) || (p.store ?? '').toLowerCase().includes(q),
        )
      : all;
  });
  protected readonly months = computed(() => groupByMonth(this.shown()));
  protected readonly totals = computed(() => purchaseTotals(this.shown()));
  protected readonly estimates = computed(() => estimateSummary(this.shown()));

  constructor() {
    this.load();
    // Opening another one while already here (search, a reminder) arrives as a new `?open=`.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.opened = false;
          if (this.purchases()) {
            this.openRequested();
          }
        });
      }
    });
  }

  protected setSpan(span: Span): void {
    this.span.set(span);
    this.load();
  }

  protected load(): void {
    const today = todayIso();
    const from =
      this.span() === 'month'
        ? `${today.slice(0, 7)}-01`
        : this.span() === 'year'
          ? `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
          : undefined;
    this.purchasesService
      .purchases(from, from ? today : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (purchases) => {
          this.purchases.set(purchases);
          this.loadFailed.set(false);
          this.openRequested();
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(purchase?: Purchase): Promise<void> {
    const result = await openPurchaseEditor(this.modal, purchase);
    if (result) {
      this.load();
      this.toast.success(result.kind === 'saved' ? 'Purchase saved.' : 'Purchase deleted.');
    }
  }

  /** Opens the purchase named in `?open=` once (it may be older than the span shown, so it's fetched). */
  private openRequested(): void {
    const id = Number(this.open());
    if (this.opened || !id) {
      return;
    }
    this.opened = true;
    void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
    this.purchasesService.purchase(id).subscribe({
      next: (purchase) => void this.edit(purchase),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the purchase.')),
    });
  }
}
