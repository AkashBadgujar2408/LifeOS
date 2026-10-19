import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AgGridAngular } from 'ag-grid-angular';
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColDef,
  ModuleRegistry,
  QuickFilterModule,
  CellKeyDownEvent,
  FullWidthCellKeyDownEvent,
  RowClickedEvent,
  RowStyleModule,
  ValidationModule,
  themeQuartz,
} from 'ag-grid-community';
import { catchError, of } from 'rxjs';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import {
  Account,
  FinanceService,
  Ledger,
  LedgerFilter,
  TRANSACTION_KINDS,
  Transaction,
  TransactionKind,
} from '../../core/services/finance.service';
import { TagsService } from '../../core/services/tags.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import {
  TRANSACTION_KIND_LABELS,
  accountLine,
  formatMoney,
  monthRange,
  signedAmount,
  signedMoney,
  transactionTitle,
} from './finance-view';
import { openTransactionEditor } from './transaction-editor';

// Only what this grid uses: client-side rows, the search box, row/cell classes (ValidationModule explains a
// missing module in development; it's tree-shaken from production builds).
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  QuickFilterModule,
  RowStyleModule,
  CellStyleModule,
  ...(isDevMode() ? [ValidationModule] : []),
]);

/** The grid in LifeOS tokens: hairline borders, the body font, teal for focus and selection. */
const LEDGER_THEME = themeQuartz.withParams({
  fontFamily: 'inherit',
  accentColor: 'var(--lifeos-teal)',
  borderColor: 'var(--lifeos-border)',
  foregroundColor: 'var(--lifeos-ink)',
  backgroundColor: 'var(--cui-body-bg, #fff)',
  headerBackgroundColor: 'var(--lifeos-canvas)',
  wrapperBorderRadius: '0.375rem',
});

/**
 * The ledger: transactions filtered by day range, account, tag and kind (on the server, so the totals match what's
 * shown), searched and sorted in the grid. A row opens its editor. Totals are in the base currency; transfers move
 * money between your own accounts, so they're in neither income nor spending.
 */
@Component({
  selector: 'app-finance-ledger',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgbInputDatepicker,
    AgGridAngular,
    RouterLink,
    LoadError,
    BaseCurrencyPrompt,
  ],
  template: `
    <div class="container-fluid container-xxl py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1">Transactions</h1>
          <p class="text-body-secondary mb-0 small">
            Every income, expense and transfer. Pick a row to change it or add a receipt.
          </p>
        </div>
        <div class="d-flex gap-2">
          <a routerLink="/finance/import" class="btn btn-outline-primary">
            <i class="bi bi-box-arrow-in-down"></i> Import statement
          </a>
          <button type="button" class="btn btn-primary" (click)="add()">
            <i class="bi bi-plus-lg"></i> Add transaction
          </button>
        </div>
      </div>

      <app-base-currency-prompt />

      <div class="card mb-3">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-from">From</label>
              <div class="input-group input-group-sm">
                <input
                  id="ledger-from"
                  type="text"
                  class="form-control"
                  placeholder="e.g. 01/Oct/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #fromPicker="ngbDatepicker"
                  [minDate]="minDate"
                  container="body"
                  [ngModel]="from()"
                  (ngModelChange)="setFilter({ from: $event })"
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
            </div>
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-to">To</label>
              <div class="input-group input-group-sm">
                <input
                  id="ledger-to"
                  type="text"
                  class="form-control"
                  placeholder="e.g. 31/Oct/2026"
                  autocomplete="off"
                  ngbDatepicker
                  #toPicker="ngbDatepicker"
                  [minDate]="minDate"
                  container="body"
                  [ngModel]="to()"
                  (ngModelChange)="setFilter({ to: $event })"
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
            </div>
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-account">Account</label>
              <select
                id="ledger-account"
                class="form-select form-select-sm"
                [ngModel]="filter().accountId"
                (ngModelChange)="setFilter({ accountId: $event })"
              >
                <option [ngValue]="null" [selected]="filter().accountId === null">
                  All accounts
                </option>
                @for (a of accounts(); track a.id) {
                  <option [ngValue]="a.id" [selected]="a.id === filter().accountId">
                    {{ a.name }}
                  </option>
                }
              </select>
            </div>
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-tag">Tag</label>
              <select
                id="ledger-tag"
                class="form-select form-select-sm"
                [ngModel]="filter().tagId"
                (ngModelChange)="setFilter({ tagId: $event })"
              >
                <option [ngValue]="null" [selected]="filter().tagId === null">Any tag</option>
                @for (t of tags(); track t.id) {
                  <option [ngValue]="t.id" [selected]="t.id === filter().tagId">
                    {{ t.name }}
                  </option>
                }
              </select>
            </div>
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-kind">Kind</label>
              <select
                id="ledger-kind"
                class="form-select form-select-sm"
                [ngModel]="filter().kind"
                (ngModelChange)="setFilter({ kind: $event })"
              >
                <option [ngValue]="null" [selected]="filter().kind === null">Everything</option>
                @for (k of kinds; track k) {
                  <option [ngValue]="k" [selected]="k === filter().kind">
                    {{ kindLabels[k] }}
                  </option>
                }
              </select>
            </div>
            <div class="col-6 col-md-3 col-xl-2">
              <label class="form-label small" for="ledger-search">Search</label>
              <input
                id="ledger-search"
                type="search"
                class="form-control form-control-sm"
                placeholder="Payee, note, tag…"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
              />
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button type="button" class="btn btn-link btn-sm p-0" (click)="setMonth(0)">
              This month
            </button>
            <button type="button" class="btn btn-link btn-sm p-0" (click)="setMonth(-1)">
              Last month
            </button>
            <button
              type="button"
              class="btn btn-link btn-sm p-0"
              (click)="setFilter({ from: null, to: null })"
            >
              All time
            </button>
          </div>
        </div>
      </div>

      @if (loadFailed() && !ledger()) {
        <app-load-error message="Couldn't load your transactions." (retry)="load()" />
      } @else if (ledger(); as ledger) {
        @if (ledger.totals.currency; as currency) {
          <div class="d-flex flex-wrap gap-4 mb-3" aria-live="polite">
            <div>
              <div class="small text-body-secondary">Income</div>
              <div class="h5 mb-0">{{ money(ledger.totals.income, currency) }}</div>
            </div>
            <div>
              <div class="small text-body-secondary">Spending</div>
              <div class="h5 mb-0">{{ money(ledger.totals.spending, currency) }}</div>
            </div>
            <div>
              <div class="small text-body-secondary">Net</div>
              <div class="h5 mb-0">{{ money(ledger.totals.net, currency) }}</div>
            </div>
            <div class="align-self-end small text-body-secondary">
              {{ ledger.transactions.length }}
              {{ ledger.transactions.length === 1 ? 'transaction' : 'transactions' }}
              @if (ledger.totals.unconverted > 0) {
                · {{ ledger.totals.unconverted }} in another currency without a rate, left out
              }
            </div>
          </div>
        }
        @if (ledger.transactions.length === 0) {
          <p class="text-body-secondary">
            Nothing in this range.
            @if (accounts().length === 0) {
              Add an account first, on the Accounts page.
            }
          </p>
        } @else {
          <ag-grid-angular
            class="d-block ledger-grid"
            style="height: 65vh; min-height: 360px"
            [theme]="theme"
            [rowData]="ledger.transactions"
            [columnDefs]="columns()"
            [defaultColDef]="defaultColumn"
            [quickFilterText]="search()"
            [getRowId]="rowId"
            [animateRows]="false"
            (rowClicked)="open($event)"
            (cellKeyDown)="keyOpen($event)"
          />
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceLedger {
  private readonly financeService = inject(FinanceService);
  private readonly tagsService = inject(TagsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly theme = LEDGER_THEME;
  protected readonly kinds = TRANSACTION_KINDS;
  protected readonly kindLabels = TRANSACTION_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly ledger = signal<Ledger | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly tags = toSignal(this.tagsService.list().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly search = signal('');
  protected readonly filter = signal<LedgerFilter>({
    ...monthRange(todayIso()),
    accountId: null,
    tagId: null,
    kind: null,
  });
  protected readonly from = computed(() => this.filter().from);
  protected readonly to = computed(() => this.filter().to);

  /** On a phone only the day, what and amount fit; the rest is in the editor a tap away. */
  private readonly narrow =
    typeof matchMedia === 'function' && matchMedia('(max-width: 575.98px)').matches;

  protected readonly defaultColumn: ColDef<Transaction> = { sortable: true, resizable: true };
  protected readonly rowId = (params: { data: Transaction }) => String(params.data.id);

  protected readonly columns = computed<ColDef<Transaction>[]>(() => {
    const accountId = this.filter().accountId;
    return [
      {
        headerName: 'Day',
        field: 'occurredOn',
        sort: 'desc',
        width: 120,
        valueFormatter: (p) => (p.value ? formatDate(p.value, APP_DATE_FORMAT, this.locale) : ''),
        // Same day: newest entry first, as the server sends them.
        comparator: (a: string, b: string, nodeA, nodeB) =>
          a === b ? (nodeA.data?.id ?? 0) - (nodeB.data?.id ?? 0) : a < b ? -1 : 1,
      },
      {
        headerName: 'What',
        colId: 'what',
        flex: 2,
        minWidth: 160,
        valueGetter: (p) => (p.data ? transactionTitle(p.data) : ''),
        getQuickFilterText: (p) =>
          p.data
            ? [p.data.payee, p.data.note, p.data.reference, transactionTitle(p.data)].join(' ')
            : '',
      },
      {
        headerName: 'Tags',
        colId: 'tags',
        flex: 1,
        minWidth: 120,
        hide: this.narrow,
        valueGetter: (p) => p.data?.tags.map((t) => t.name).join(', ') ?? '',
      },
      {
        headerName: 'Account',
        colId: 'account',
        flex: 1.5,
        minWidth: 150,
        hide: this.narrow,
        valueGetter: (p) => (p.data ? accountLine(p.data) : ''),
      },
      {
        headerName: 'Kind',
        field: 'kind',
        width: 110,
        hide: this.narrow,
        valueFormatter: (p) => (p.value ? TRANSACTION_KIND_LABELS[p.value as TransactionKind] : ''),
      },
      {
        headerName: 'Amount',
        colId: 'amount',
        width: 150,
        type: 'rightAligned',
        valueGetter: (p) => (p.data ? signedAmount(p.data, accountId).amount : 0),
        valueFormatter: (p) => (p.data ? signedMoney(p.data, accountId) : ''),
        getQuickFilterText: () => '',
        cellClassRules: {
          'fw-semibold': (p) => !!p.data && signedAmount(p.data, accountId).sign === 1,
        },
      },
    ];
  });

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const accountId = Number(params.get('accountId'));
        this.filter.update((f) => ({
          ...f,
          accountId: Number.isInteger(accountId) && accountId > 0 ? accountId : null,
        }));
        this.load();
      });
    this.financeService
      .accounts()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (accounts) => this.accounts.set(accounts), error: () => undefined });
  }

  protected load(): void {
    this.financeService
      .ledger(this.filter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ledger) => {
          this.ledger.set(ledger);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected setFilter(change: Partial<LedgerFilter>): void {
    // A half-typed day in a picker comes through as null-ish junk; only real "yyyy-MM-dd" days filter.
    for (const key of ['from', 'to'] as const) {
      if (
        key in change &&
        change[key] !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(String(change[key]))
      ) {
        return;
      }
    }
    this.filter.update((f) => ({ ...f, ...change }));
    this.load();
  }

  /** This month (0) or the one before (-1), counted on year/month numbers. */
  protected setMonth(offset: 0 | -1): void {
    const [year, month] = todayIso().split('-').map(Number);
    const target =
      offset === 0
        ? { year, month }
        : month === 1
          ? { year: year - 1, month: 12 }
          : { year, month: month - 1 };
    this.setFilter(monthRange(`${target.year}-${String(target.month).padStart(2, '0')}-01`));
  }

  protected async add(): Promise<void> {
    const result = await openTransactionEditor(this.modal, { accountId: this.filter().accountId });
    if (result) {
      this.toast.success('Transaction saved.');
      this.load();
    }
  }

  /** Enter on a focused cell opens its row, as a click does. */
  protected keyOpen(
    event: CellKeyDownEvent<Transaction> | FullWidthCellKeyDownEvent<Transaction>,
  ): void {
    if ((event.event as KeyboardEvent | null)?.key === 'Enter' && event.data) {
      void this.openTransaction(event.data);
    }
  }

  protected open(event: RowClickedEvent<Transaction>): void {
    if (event.data) {
      void this.openTransaction(event.data);
    }
  }

  private async openTransaction(transaction: Transaction): Promise<void> {
    const result = await openTransactionEditor(this.modal, { transaction });
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Transaction saved.' : 'Transaction deleted.');
      this.load();
    }
  }
}
