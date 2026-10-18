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
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Account, FinanceService } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openAccountEditor } from './account-editor';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import {
  ACCOUNT_KIND_ICONS,
  ACCOUNT_KIND_LABELS,
  formatMoney,
  totalsByCurrency,
} from './finance-view';
import { openTransactionEditor } from './transaction-editor';

/** Where your money sits: every account with what it holds today, open ones first. */
@Component({
  selector: 'app-finance-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, BaseCurrencyPrompt],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Accounts</h1>
          <p class="text-body-secondary mb-0 small">
            Bank accounts, cash, wallets and cards — what each holds at the end of today.
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-primary" (click)="addTransaction()">
            <i class="bi bi-plus-lg"></i> Transaction
          </button>
          <button type="button" class="btn btn-primary" (click)="edit()">
            <i class="bi bi-plus-lg"></i> Add account
          </button>
        </div>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !accounts()) {
        <app-load-error message="Couldn't load your accounts." (retry)="load()" />
      } @else if (accounts(); as accounts) {
        @if (accounts.length === 0) {
          <p class="text-body-secondary">
            No accounts yet. Add the bank account your salary lands in, and the cash in your wallet.
          </p>
        } @else {
          @if (totals().length > 0) {
            <div class="d-flex flex-wrap gap-4 mb-3" aria-label="Held in open accounts">
              @for (t of totals(); track t.currency) {
                <div>
                  <div class="small text-body-secondary">In {{ t.currency }} accounts</div>
                  <div class="h4 mb-0">{{ money(t.total, t.currency) }}</div>
                </div>
              }
            </div>
          }
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (a of accounts; track a.id) {
                <li class="list-group-item py-3" [class.text-body-secondary]="a.isArchived">
                  <div class="d-flex gap-3 align-items-start">
                    <i class="bi {{ kindIcons[a.kind] }} fs-5 mt-1" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(a)"
                      >
                        {{ a.name }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[a.kind] }}
                        @if (a.institution) {
                          · {{ a.institution }}
                        }
                        @if (a.numberLast4) {
                          · ••{{ a.numberLast4 }}
                        }
                        @if (a.isArchived) {
                          · archived
                        }
                      </div>
                      <div class="small">
                        <a routerLink="/finance/transactions" [queryParams]="{ accountId: a.id }">
                          {{ a.transactionCount }}
                          {{ a.transactionCount === 1 ? 'transaction' : 'transactions' }}</a
                        >
                        @if (a.lastOn) {
                          <span class="text-body-secondary"> · last {{ a.lastOn | date }}</span>
                        }
                      </div>
                    </div>
                    <div class="text-end">
                      <div class="fw-semibold" [class.text-danger]="a.balance < 0">
                        {{ money(a.balance, a.currency) }}
                      </div>
                      <div class="small text-body-secondary">
                        opened with {{ money(a.openingBalance, a.currency) }}
                      </div>
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
export class FinanceAccounts {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindIcons = ACCOUNT_KIND_ICONS;
  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly totals = computed(() =>
    totalsByCurrency((this.accounts() ?? []).filter((a) => !a.isArchived)),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.financeService
      .accounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (accounts) => {
          this.accounts.set(accounts);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(account?: Account): Promise<void> {
    const result = await openAccountEditor(this.modal, account);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Account saved.' : 'Account deleted.');
      this.load();
    }
  }

  protected async addTransaction(): Promise<void> {
    const result = await openTransactionEditor(this.modal);
    if (result) {
      this.toast.success('Transaction saved.');
      this.load();
    }
  }
}
