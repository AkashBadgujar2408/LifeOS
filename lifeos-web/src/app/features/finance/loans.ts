import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FinanceService, Loan } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { LOAN_KIND_LABELS, formatMoney, loanPaidPercent } from './finance-view';
import { openLoanEditor } from './loan-editor';

/** Money borrowed and lent: what's still owed today, the instalment, how far along; closed ones last. */
@Component({
  selector: 'app-finance-loans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, BaseCurrencyPrompt],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Loans</h1>
          <p class="text-body-secondary mb-0 small">
            What you owe and what you're owed, instalment by instalment.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="add()">
          <i class="bi bi-plus-lg"></i> Add loan
        </button>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !loans()) {
        <app-load-error message="Couldn't load your loans." (retry)="load()" />
      } @else if (loans(); as loans) {
        @if (loans.length === 0) {
          <p class="text-body-secondary">
            No loans. Add a home or car loan to see its EMI schedule — or money you lent someone.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (l of loans; track l.id) {
                <li class="list-group-item py-3" [class.text-body-secondary]="l.closedOn">
                  <div class="d-flex gap-3 align-items-start">
                    <i
                      class="bi mt-1"
                      [class.bi-box-arrow-in-down]="l.direction === 'Borrowed'"
                      [class.bi-box-arrow-up]="l.direction === 'Lent'"
                      aria-hidden="true"
                    ></i>
                    <div class="min-w-0 flex-grow-1">
                      <a
                        [routerLink]="['/finance/loans', l.id]"
                        class="fw-semibold link-body-emphasis text-decoration-none text-break"
                      >
                        {{ l.name }}
                      </a>
                      <div class="small text-body-secondary">
                        {{ l.direction === 'Lent' ? 'Lent' : kindLabels[l.kind] }}
                        @if (l.counterparty || l.contactName) {
                          · {{ l.direction === 'Lent' ? 'to' : 'from' }}
                          {{ l.counterparty ?? l.contactName }}
                        }
                        · {{ l.annualRate }}% · {{ money(l.emi, l.currency) }} a month
                      </div>
                      <div class="small">
                        @if (l.closedOn) {
                          Closed {{ l.closedOn | date }}
                        } @else {
                          {{ l.instalmentsPaid }} of {{ l.instalmentCount }} instalments ({{
                            paid(l.instalmentsPaid, l.instalmentCount)
                          }}%)
                          @if (l.nextDueOn) {
                            <span class="text-body-secondary">
                              · next {{ l.nextDueOn | date }}</span
                            >
                          }
                        }
                      </div>
                    </div>
                    <div class="text-end">
                      <div class="fw-semibold">{{ money(l.outstanding, l.currency) }}</div>
                      <div class="small text-body-secondary">
                        {{ l.direction === 'Lent' ? 'still owed to you' : 'still owed' }}
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
export class FinanceLoans {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = LOAN_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly paid = loanPaidPercent;
  protected readonly loans = signal<Loan[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.financeService
      .loans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (loans) => {
          this.loans.set(loans);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async add(): Promise<void> {
    const result = await openLoanEditor(this.modal);
    if (result?.kind === 'saved') {
      this.toast.success('Loan saved.');
      void this.router.navigate(['/finance/loans', result.detail.loan.id]);
    }
  }
}
