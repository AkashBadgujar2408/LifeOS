import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { ColDef } from 'ag-grid-community';
import { addDaysIso, todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter, numberFormatter } from '../../core/grid/grid-format';
import { apiErrorMessage } from '../../core/services/api-error';
import { HomeService, UtilityBill } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openBillEditor, openBillPay } from './bill-editor';
import { BILL_KIND_ICONS, BILL_KIND_LABELS, billTotals, dueStatus } from './home-view';

/** What the house costs to run: bills to pay (due soonest first), the last year by kind, and what's been paid. */
@Component({
  selector: 'app-home-bills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, LoadError, DataGrid],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Bills</h1>
          <p class="text-body-secondary mb-0 small">
            Electricity, water, internet, rent — paid once into your ledger, never twice.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add bill
        </button>
      </div>

      @if (loadFailed() && !bills()) {
        <app-load-error message="Couldn't load your bills." (retry)="load()" />
      } @else if (bills(); as bills) {
        @if (bills.length === 0) {
          <p class="text-body-secondary">
            No bills yet. Add this month's electricity or internet bill to see it on the calendar
            and pay it straight into your ledger.
          </p>
        } @else {
          <section class="mb-4" aria-labelledby="bills-to-pay">
            <h2 id="bills-to-pay" class="h5 mb-3">To pay</h2>
            @if (unpaid().length === 0) {
              <p class="small text-body-secondary">Nothing to pay. Nicely done.</p>
            } @else {
              <div class="card">
                <ul class="list-group list-group-flush">
                  @for (b of unpaid(); track b.id) {
                    @let due = dueOf(b.dueOn);
                    <li class="list-group-item py-3">
                      <div class="d-flex flex-wrap gap-2 align-items-center">
                        <i class="bi {{ kindIcons[b.kind] }}" aria-hidden="true"></i>
                        <div class="min-w-0 flex-grow-1">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                            (click)="edit(b)"
                          >
                            {{ b.provider ?? kindLabels[b.kind] }}
                          </button>
                          <div class="small text-body-secondary">
                            {{ kindLabels[b.kind] }}
                            @if (b.propertyName) {
                              · {{ b.propertyName }}
                            }
                            @if (b.periodStart && b.periodEnd) {
                              · {{ b.periodStart | date }} – {{ b.periodEnd | date }}
                            }
                          </div>
                        </div>
                        <div class="text-end small">
                          <div class="fw-semibold">{{ money(b.amount, b.currency) }}</div>
                          <div
                            [class.text-danger-emphasis]="due.state === 'past'"
                            [class.fw-semibold]="due.state === 'today' || due.state === 'soon'"
                          >
                            {{ due.state === 'later' ? 'Due ' + (b.dueOn | date) : due.label }}
                          </div>
                        </div>
                        <button
                          type="button"
                          class="btn btn-outline-primary btn-sm"
                          (click)="pay(b)"
                        >
                          Pay
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }
          </section>

          @if (yearTotals().length) {
            <section class="card mb-4" aria-labelledby="bills-year">
              <div class="card-body">
                <h2 id="bills-year" class="h6 mb-3">The last 12 months</h2>
                <table class="table table-sm mb-0 small">
                  <thead>
                    <tr>
                      <th scope="col">Bill</th>
                      <th scope="col" class="text-end">Bills</th>
                      <th scope="col" class="text-end">Total</th>
                      <th scope="col" class="text-end">A month</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (t of yearTotals(); track t.kind + t.currency) {
                      <tr>
                        <td>
                          <i class="bi {{ kindIcons[t.kind] }} me-1" aria-hidden="true"></i
                          >{{ kindLabels[t.kind] }}
                        </td>
                        <td class="text-end">{{ t.count | number }}</td>
                        <td class="text-end">{{ money(t.total, t.currency) }}</td>
                        <td class="text-end">{{ money(t.total / 12, t.currency) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          @if (paid().length) {
            <section aria-labelledby="bills-paid">
              <h2 id="bills-paid" class="h5 mb-3">Paid</h2>
              @if (selectedPaid(); as b) {
                <div
                  class="card mb-2 border-primary-subtle"
                  role="region"
                  aria-label="The bill you picked"
                >
                  <div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center small">
                    <span class="fw-semibold me-auto text-break">
                      {{ b.provider ?? kindLabels[b.kind] }} · {{ money(b.amount, b.currency) }} ·
                      paid {{ b.paidOn | date }}
                    </span>
                    <button type="button" class="btn btn-link btn-sm p-0" (click)="edit(b)">
                      Open
                    </button>
                    <button type="button" class="btn btn-link btn-sm p-0" (click)="next(b)">
                      Next bill
                    </button>
                    <button
                      type="button"
                      class="btn btn-link btn-sm p-0 link-secondary"
                      (click)="unpay(b)"
                    >
                      Take back
                    </button>
                    <button
                      type="button"
                      class="btn-close btn-sm"
                      aria-label="Close"
                      (click)="selectedPaidId.set(null)"
                    ></button>
                  </div>
                </div>
              } @else {
                <p class="small text-body-secondary mb-2">
                  Pick a bill to open it, add the next one like it, or take its payment back.
                </p>
              }
              <app-data-grid
                name="paid-bills"
                [rows]="paid()"
                [columns]="columns"
                [phoneColumns]="['dueOn', 'provider', 'amount']"
                [rowId]="rowId"
                [noun]="['bill', 'bills']"
                (open)="selectedPaidId.set($event.id)"
              />
            </section>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeBills {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly kindLabels = BILL_KIND_LABELS;
  protected readonly kindIcons = BILL_KIND_ICONS;
  protected readonly money = formatMoney;
  protected readonly bills = signal<UtilityBill[] | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  /** The API's order: unpaid due soonest first, then paid latest first. */
  protected readonly unpaid = computed(() => (this.bills() ?? []).filter((b) => !b.paidOn));
  protected readonly paid = computed(() => (this.bills() ?? []).filter((b) => b.paidOn));
  protected readonly selectedPaidId = signal<number | null>(null);
  protected readonly selectedPaid = computed(
    () => this.paid().find((b) => b.id === this.selectedPaidId()) ?? null,
  );
  protected readonly rowId = (b: UtilityBill) => b.id;
  protected readonly columns: ColDef<UtilityBill>[] = [
    {
      headerName: 'Due',
      field: 'dueOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Bill',
      field: 'provider',
      flex: 1,
      minWidth: 140,
      valueGetter: (p) => (p.data ? (p.data.provider ?? BILL_KIND_LABELS[p.data.kind]) : ''),
    },
    {
      headerName: 'Kind',
      field: 'kind',
      width: 120,
      valueFormatter: (p) => (p.value ? BILL_KIND_LABELS[p.value as UtilityBill['kind']] : ''),
    },
    { headerName: 'Property', field: 'propertyName', width: 130 },
    {
      headerName: 'Amount',
      field: 'amount',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => (p.data ? formatMoney(p.data.amount, p.data.currency) : ''),
    },
    {
      headerName: 'Paid',
      field: 'paidOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'From', field: 'paidFromAccountName', width: 140 },
    {
      headerName: 'Units',
      field: 'unitsUsed',
      width: 95,
      type: 'rightAligned',
      valueFormatter: numberFormatter(this.locale),
    },
  ];
  protected readonly yearTotals = computed(() =>
    billTotals(this.bills() ?? [], addDaysIso(this.today, -364), this.today),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.homeService
      .bills()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bills) => {
          this.bills.set(bills);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected dueOf(day: string) {
    return dueStatus(day, this.today);
  }

  protected async edit(bill?: UtilityBill): Promise<void> {
    const result = await openBillEditor(this.modal, bill);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Bill saved.' : 'Bill deleted.');
    }
  }

  /** A new bill like this one (same kind, provider, property, currency). */
  protected async next(bill: UtilityBill): Promise<void> {
    const result = await openBillEditor(this.modal, undefined, bill);
    if (result) {
      this.load();
      this.toast.success('Bill saved.');
    }
  }

  protected async pay(bill: UtilityBill): Promise<void> {
    const paid = await openBillPay(this.modal, bill);
    if (paid) {
      this.load();
      this.toast.success(paid.transactionId ? 'Paid — recorded in Finance.' : 'Marked paid.');
    }
  }

  protected async unpay(bill: UtilityBill): Promise<void> {
    const confirmed = await Swal.fire({
      title: 'Take the payment back?',
      text: bill.transactionId
        ? 'The bill goes back to "to pay" and the expense it added to Finance is deleted.'
        : 'The bill goes back to "to pay".',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Take it back',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.unpayBill(bill.id).subscribe({
      next: () => {
        this.load();
        this.toast.success('Payment taken back.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take it back.')),
    });
  }
}
