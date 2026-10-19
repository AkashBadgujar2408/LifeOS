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
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { FinanceService, InsurancePolicy } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import {
  POLICY_KIND_ICONS,
  POLICY_KIND_LABELS,
  PREMIUM_FREQUENCY_LABELS,
  formatMoney,
  policyStatus,
  totalsByCurrency,
} from './finance-view';
import { openPolicyEditor } from './policy-editor';

/** What protects you: every policy, renewing soonest first, with the year's premiums added up. */
@Component({
  selector: 'app-finance-insurance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Insurance</h1>
          <p class="text-body-secondary mb-0 small">
            Your policies, what they cover and when each one renews.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add policy
        </button>
      </div>

      @if (loadFailed() && !policies()) {
        <app-load-error message="Couldn't load your policies." (retry)="load()" />
      } @else if (policies(); as policies) {
        @if (policies.length === 0) {
          <p class="text-body-secondary">
            No policies yet. Add your health, life or vehicle cover to be reminded before each
            renewal.
          </p>
        } @else {
          @if (yearly().length) {
            <p class="small text-body-secondary">
              Premiums come to
              @for (t of yearly(); track t.currency; let last = $last) {
                <strong class="text-body">{{ money(t.total, t.currency) }}</strong
                >{{ last ? '' : ' + ' }}
              }
              a year on the policies in force.
            </p>
          }
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (p of policies; track p.id) {
                @let status = statusOf(p);
                <li
                  class="list-group-item py-3"
                  [class.text-body-secondary]="status.kind === 'ended'"
                >
                  <div class="d-flex gap-3 align-items-start">
                    <i class="bi mt-1 {{ kindIcons[p.kind] }}" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(p)"
                      >
                        {{ p.name }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[p.kind] }}
                        @if (p.insurer) {
                          · {{ p.insurer }}
                        }
                        @if (p.policyNumberLast4) {
                          · •••• {{ p.policyNumberLast4 }}
                        }
                        @if (p.premium !== null && p.premiumFrequency) {
                          · {{ money(p.premium, p.currency) }}
                          {{ frequencyLabels[p.premiumFrequency] }}
                        }
                      </div>
                      <div class="small">
                        @switch (status.kind) {
                          @case ('ended') {
                            Ended {{ p.endsOn | date }}
                          }
                          @case ('overdue') {
                            <span class="text-danger-emphasis">
                              <i class="bi bi-exclamation-circle"></i> Renewal was due
                              {{ p.renewsOn | date }} — renewed? Set the next date.
                            </span>
                          }
                          @case ('soon') {
                            <span class="fw-semibold">
                              <i class="bi bi-clock"></i> Renews {{ p.renewsOn | date }} ({{
                                status.days === 0 ? 'today' : 'in ' + status.days + ' days'
                              }})
                            </span>
                          }
                          @default {
                            @if (p.renewsOn) {
                              Renews {{ p.renewsOn | date }}
                            } @else if (p.endsOn) {
                              Runs until {{ p.endsOn | date }}
                            } @else {
                              In force
                            }
                          }
                        }
                        @if (p.renewalReminderDays !== null && status.kind !== 'ended') {
                          <span class="text-body-secondary">
                            · <i class="bi bi-bell" aria-hidden="true"></i>
                            {{ p.renewalReminderDays }} days before</span
                          >
                        }
                      </div>
                    </div>
                    @if (p.sumAssured !== null) {
                      <div class="text-end">
                        <div class="fw-semibold">{{ money(p.sumAssured, p.currency) }}</div>
                        <div class="small text-body-secondary">cover</div>
                      </div>
                    }
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
export class FinanceInsurance {
  private readonly financeService = inject(FinanceService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = POLICY_KIND_LABELS;
  protected readonly kindIcons = POLICY_KIND_ICONS;
  protected readonly frequencyLabels = PREMIUM_FREQUENCY_LABELS;
  protected readonly money = formatMoney;
  protected readonly policies = signal<InsurancePolicy[] | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  /** Yearly premiums of the policies still in force, per currency. */
  protected readonly yearly = computed(() =>
    totalsByCurrency(
      (this.policies() ?? [])
        .filter((p) => p.annualPremium !== null && policyStatus(p, this.today).kind !== 'ended')
        .map((p) => ({ currency: p.currency, balance: p.annualPremium! })),
    ),
  );

  constructor() {
    this.load();
  }

  protected statusOf(policy: InsurancePolicy) {
    return policyStatus(policy, this.today);
  }

  protected load(): void {
    this.financeService
      .policies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (policies) => {
          this.policies.set(policies);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(policy?: InsurancePolicy): Promise<void> {
    const result = await openPolicyEditor(this.modal, policy);
    // Reload even on dismiss: links and reminders added in the editor apply immediately.
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Policy saved.' : 'Policy deleted.');
    }
  }
}
