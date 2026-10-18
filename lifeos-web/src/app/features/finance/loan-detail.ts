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
import { LOAN_KIND_LABELS, formatMoney, loanPaidPercent } from './finance-view';
import { openLoanEditor } from './loan-editor';

/**
 * One loan: the instalment, what's owed today, and the full schedule — each month's payment split into interest and
 * principal, with the balance after it. Instalments already due are marked; the next one is highlighted.
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
              · {{ money(d.loan.principal, d.loan.currency) }} at {{ d.loan.annualRate }}% for
              {{ d.loan.termMonths }} months from {{ d.loan.startDate | date }}
            </p>
          </div>
          <button type="button" class="btn btn-outline-primary" (click)="edit()">
            <i class="bi bi-pencil"></i> Edit
          </button>
        </div>

        <div class="d-flex flex-wrap gap-4 mb-4">
          <div>
            <div class="small text-body-secondary">
              {{ d.loan.direction === 'Lent' ? 'Still owed to you' : 'Still owed' }}
            </div>
            <div class="h4 mb-0">{{ money(d.loan.outstanding, d.loan.currency) }}</div>
          </div>
          <div>
            <div class="small text-body-secondary">Instalment</div>
            <div class="h4 mb-0">{{ money(d.loan.emi, d.loan.currency) }}</div>
          </div>
          <div>
            <div class="small text-body-secondary">Paid so far</div>
            <div class="h4 mb-0">
              {{ d.loan.instalmentsPaid }} / {{ d.loan.instalmentCount }}
              <span class="small text-body-secondary">({{ paid() }}%)</span>
            </div>
          </div>
          <div>
            <div class="small text-body-secondary">Interest over the loan</div>
            <div class="h4 mb-0">{{ money(d.loan.totalInterest, d.loan.currency) }}</div>
          </div>
        </div>
        @if (d.loan.closedOn) {
          <p class="small">Closed on {{ d.loan.closedOn | date }} — nothing is owed from then.</p>
        }

        <div class="card mb-4">
          <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
            <h2 class="h6 mb-0">Instalment schedule</h2>
            <button type="button" class="btn btn-link btn-sm p-0" (click)="showAll.set(!showAll())">
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
                    <td class="text-end text-nowrap">{{ money(row.payment, d.loan.currency) }}</td>
                    <td class="text-end text-nowrap">{{ money(row.interest, d.loan.currency) }}</td>
                    <td class="text-end text-nowrap">
                      {{ money(row.principal, d.loan.currency) }}
                    </td>
                    <td class="text-end text-nowrap">{{ money(row.balance, d.loan.currency) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

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

  protected readonly paid = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loanPaidPercent(loan.instalmentsPaid, loan.instalmentCount) : 0;
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
