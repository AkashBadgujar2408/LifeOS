import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  untracked,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { FinanceService, LoanDetail as LoanDetailData } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import { LOAN_KIND_LABELS, formatMoney, loanRepaidPercent, loanScheduleText } from './finance-view';
import { openLoanMoney } from './loan-money-dialog';
import { openLoanEditor } from './loan-editor';

/**
 * One loan: what's still owed from the payments actually made (each a Finance transaction), the money at the start,
 * the payments with how each split into interest and principal, and — for an EMI loan — the schedule and whether it's
 * behind or ahead of it (each instalment split into interest and principal, with the balance after it; due ones are
 * marked, the next highlighted).
 */
@Component({
  selector: 'app-loan-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, LinkedItems, EntityReminders],
  template: `
    <div class="container py-4">
      <a routerLink="/finance/loans" class="small text-decoration-none">
        <i class="bi bi-arrow-left"></i> Loans
      </a>
      @if (loadFailed() && !detail()) {
        <app-load-error message="Couldn't load this loan." (retry)="load()" />
      } @else if (detail(); as d) {
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mt-2 mb-3">
          <div class="min-w-0">
            <h1 class="h3 mb-1 text-break">{{ d.loan.name }}</h1>
            <p class="text-body-secondary small mb-0">
              {{ d.loan.direction === 'Lent' ? 'Money you lent' : kindLabels[d.loan.kind] }}
              @if (d.loan.counterparty || d.loan.contactName) {
                · {{ d.loan.direction === 'Lent' ? 'to' : 'from' }}
                {{ d.loan.counterparty ?? d.loan.contactName }}
              }
              · {{ money(d.loan.principal, d.loan.currency) }} ·
              {{ d.loan.annualRate === 0 ? 'interest-free' : d.loan.annualRate + '%' }}
              @if (d.loan.termMonths !== null) {
                · EMI over {{ d.loan.termMonths }} months
              } @else {
                · paid back as you go
              }
              from {{ d.loan.startDate | date }}
            </p>
          </div>
          <button type="button" class="btn btn-outline-primary" (click)="edit()">
            <i class="bi bi-pencil"></i> Edit
          </button>
        </div>

        <div class="d-flex flex-wrap gap-4 mb-3">
          <div>
            <div class="small text-body-secondary">
              {{ d.loan.direction === 'Lent' ? 'Still owed to you' : 'Still owed' }}
            </div>
            <div class="h4 mb-0">{{ money(d.loan.outstanding, d.loan.currency) }}</div>
            @if (d.loan.interestDue > 0) {
              <div class="small text-body-secondary">
                incl. {{ money(d.loan.interestDue, d.loan.currency) }} interest
              </div>
            }
          </div>
          <div>
            <div class="small text-body-secondary">Paid back</div>
            <div class="h4 mb-0">
              {{ money(d.loan.repaid, d.loan.currency) }}
              <span class="small text-body-secondary">({{ repaidPercent() }}%)</span>
            </div>
          </div>
          @if (d.loan.emi !== null) {
            <div>
              <div class="small text-body-secondary">Instalment</div>
              <div class="h4 mb-0">{{ money(d.loan.emi, d.loan.currency) }}</div>
              <div class="small text-body-secondary">
                {{ d.loan.instalmentsDue }} of {{ d.loan.instalmentCount }} due so far
              </div>
            </div>
          }
          @if (d.loan.annualRate > 0) {
            <div>
              <div class="small text-body-secondary">Interest so far</div>
              <div class="h4 mb-0">{{ money(d.loan.interestCharged, d.loan.currency) }}</div>
            </div>
          }
        </div>
        @if (schedule(); as s) {
          <p class="small mb-3">
            <span
              class="badge border"
              [class.text-bg-light]="s.state !== 'behind'"
              [class.text-bg-warning]="s.state === 'behind'"
              >{{ s.text }}</span
            >
            <span class="text-body-secondary ms-1">
              against the schedule ({{ money(d.loan.scheduledOutstanding ?? 0, d.loan.currency) }}
              owed if every instalment were paid on time)
            </span>
          </p>
        }
        @if (d.loan.closedOn) {
          <p class="small">Closed on {{ d.loan.closedOn | date }} — nothing is owed from then.</p>
        }

        <section class="card mb-4" aria-labelledby="loan-start">
          <div class="card-body d-flex flex-wrap gap-2 align-items-center">
            <h2 id="loan-start" class="h6 mb-0 me-2">Money at the start</h2>
            @if (d.loan.disbursementTransactionId) {
              <span class="small flex-grow-1">
                <i class="bi bi-check2-circle text-success" aria-hidden="true"></i>
                {{ money(d.loan.principal, d.loan.currency) }}
                {{ d.loan.direction === 'Lent' ? 'out of' : 'into' }}
                {{ d.loan.disbursementAccountName ?? 'an account' }} on
                {{ d.loan.startDate | date }}
              </span>
              <button type="button" class="btn btn-link btn-sm p-0" (click)="takeBackStart()">
                Take it back
              </button>
            } @else {
              <span class="small text-body-secondary flex-grow-1">Not recorded in Finance.</span>
              @if (d.loan.startDate <= today) {
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm"
                  (click)="recordStart()"
                >
                  Record in Finance
                </button>
              }
            }
          </div>
        </section>

        <section class="card mb-4" aria-labelledby="loan-payments">
          <div
            class="card-header bg-transparent d-flex flex-wrap gap-2 justify-content-between align-items-center"
          >
            <h2 id="loan-payments" class="h6 mb-0">
              {{ d.loan.direction === 'Lent' ? 'Paid back to you' : 'Payments' }}
            </h2>
            @if (!d.loan.closedOn) {
              <button type="button" class="btn btn-primary btn-sm" (click)="recordPayment()">
                <i class="bi bi-plus-lg"></i> Record a payment
              </button>
            }
          </div>
          @if (d.loan.assumedPaidThrough) {
            <p class="small text-body-secondary px-3 pt-3 mb-0">
              Instalments due up to {{ d.loan.assumedPaidThrough | date }} are taken as paid;
              payments after that day count.
            </p>
          }
          @if (d.payments.length === 0) {
            <p class="small text-body-secondary p-3 mb-0">
              No payments recorded yet. Each one becomes a transaction in Finance.
            </p>
          } @else {
            <ul class="list-group list-group-flush">
              @for (p of d.payments; track p.transactionId) {
                <li class="list-group-item d-flex flex-wrap gap-2 align-items-start">
                  <div class="min-w-0 flex-grow-1">
                    <div class="fw-semibold">
                      {{ p.paidOn | date }} · {{ money(p.amount, d.loan.currency) }}
                    </div>
                    <div class="small text-body-secondary">
                      @if (p.coveredBySchedule) {
                        Counted with the instalments taken as paid
                      } @else if (p.amount < 0) {
                        More drawn on the loan
                      } @else if (d.loan.annualRate > 0) {
                        {{ money(p.interest, d.loan.currency) }} interest ·
                        {{ money(p.principal, d.loan.currency) }} principal
                      }
                      @if (p.accountName) {
                        @if (p.coveredBySchedule || p.amount < 0 || d.loan.annualRate > 0) {
                          ·
                        }
                        {{ p.accountName }}
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-link btn-sm link-danger p-0"
                    [attr.aria-label]="'Delete the payment of ' + (p.paidOn | date)"
                    (click)="removePayment(p.transactionId)"
                  >
                    Delete
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        @if (d.schedule.length) {
          <div class="card mb-4">
            <div
              class="card-header bg-transparent d-flex justify-content-between align-items-center"
            >
              <h2 class="h6 mb-0">Instalment schedule</h2>
              <button
                type="button"
                class="btn btn-link btn-sm p-0"
                (click)="showAll.set(!showAll())"
              >
                {{ showAll() ? 'Show around today' : 'Show all ' + d.schedule.length }}
              </button>
            </div>
            <div class="table-responsive">
              <table class="table table-sm mb-0 align-middle small">
                <caption class="visually-hidden">
                  Each instalment: due day, payment, interest, principal and balance after it
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Due</th>
                    <th scope="col" class="text-end">Payment</th>
                    <th scope="col" class="text-end">Interest</th>
                    <th scope="col" class="text-end">Principal</th>
                    <th scope="col" class="text-end">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.number) {
                    <tr
                      [class.text-body-secondary]="row.dueOn <= today"
                      [class.fw-semibold]="row.number === nextNumber()"
                    >
                      <td>{{ row.number }}</td>
                      <td class="text-nowrap">
                        {{ row.dueOn | date }}
                        @if (row.number === nextNumber()) {
                          <span class="badge text-bg-light border ms-1">next</span>
                        }
                      </td>
                      <td class="text-end text-nowrap">
                        {{ money(row.payment, d.loan.currency) }}
                      </td>
                      <td class="text-end text-nowrap">
                        {{ money(row.interest, d.loan.currency) }}
                      </td>
                      <td class="text-end text-nowrap">
                        {{ money(row.principal, d.loan.currency) }}
                      </td>
                      <td class="text-end text-nowrap">
                        {{ money(row.balance, d.loan.currency) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
        <div class="row g-4">
          <div class="col-md-6">
            <app-linked-items entityType="Loan" [entityId]="d.loan.id" />
          </div>
          <div class="col-md-6">
            <app-entity-reminders
              entityType="Loan"
              [entityId]="d.loan.id"
              [entityTitle]="d.loan.name"
            />
          </div>
        </div>
      } @else {
        <p class="text-body-secondary mt-3">Loading...</p>
      }
    </div>
  `,
})
export class LoanDetail {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly kindLabels = LOAN_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly today = todayIso();
  protected readonly detail = signal<LoanDetailData | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showAll = signal(false);

  protected readonly repaidPercent = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loanRepaidPercent(loan) : 0;
  });
  protected readonly schedule = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loanScheduleText(loan) : null;
  });
  protected readonly nextNumber = computed(
    () => this.detail()?.schedule.find((r) => r.dueOn > this.today)?.number ?? null,
  );
  /** A long schedule shows the last few paid and the next year, unless asked for all of it. */
  protected readonly rows = computed(() => {
    const schedule = this.detail()?.schedule ?? [];
    if (this.showAll() || schedule.length <= 24) {
      return schedule;
    }
    const next = this.nextNumber() ?? schedule.length + 1;
    return schedule.filter((r) => r.number >= next - 3 && r.number < next + 12);
  });

  constructor() {
    itemTitle(() => this.detail()?.loan.name);
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.financeService
      .loan(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async recordPayment(): Promise<void> {
    const loan = this.detail()?.loan;
    if (!loan) {
      return;
    }
    const updated = await openLoanMoney(this.modal, loan, 'payment');
    if (updated) {
      this.detail.set(updated);
      this.toast.success('Payment recorded in Finance.');
    }
  }

  protected async recordStart(): Promise<void> {
    const loan = this.detail()?.loan;
    if (!loan) {
      return;
    }
    const updated = await openLoanMoney(this.modal, loan, 'start');
    if (updated) {
      this.detail.set(updated);
      this.toast.success('Recorded in Finance.');
    }
  }

  protected async takeBackStart(): Promise<void> {
    const loan = this.detail()?.loan;
    if (!loan) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Take it back?',
      text: 'The transaction for the money at the start is deleted from your ledger. The loan stays.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Take it back',
      confirmButtonColor: 'var(--lifeos-teal-strong)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.financeService.removeLoanStart(loan.id).subscribe({
      next: (updated) => {
        this.detail.set(updated);
        this.toast.success('Taken back.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take it back.')),
    });
  }

  protected async removePayment(transactionId: number): Promise<void> {
    const loan = this.detail()?.loan;
    if (!loan) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Delete this payment?',
      text: 'Its transaction is deleted from your ledger, and what is owed goes back up.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.financeService.removeLoanPayment(loan.id, transactionId).subscribe({
      next: (updated) => {
        this.detail.set(updated);
        this.toast.success('Payment deleted.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the payment.')),
    });
  }

  protected async edit(): Promise<void> {
    const loan = this.detail()?.loan;
    if (!loan) {
      return;
    }
    const result = await openLoanEditor(this.modal, loan);
    if (result?.kind === 'saved') {
      this.detail.set(result.detail);
      this.toast.success('Loan saved.');
    } else if (result?.kind === 'deleted') {
      this.toast.success('Loan deleted.');
      void this.router.navigate(['/finance/loans']);
    }
  }
}
