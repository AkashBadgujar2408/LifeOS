import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceService, SavingsProgress as Progress } from '../../core/services/finance.service';
import { formatMoney } from './finance-view';

/**
 * A savings goal's progress: what the accounts and investments linked to the goal hold, against its target, as a
 * plain bar (full at the target) with the amount in words. Re-reads when `version` changes, and on "Refresh" after
 * links are added below it.
 */
@Component({
  selector: 'app-savings-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .savings-track {
      height: 0.6rem;
      border-radius: 999px;
      background: var(--lifeos-canvas);
      border: 1px solid var(--lifeos-border);
      overflow: hidden;
    }
    .savings-fill {
      height: 100%;
      background: var(--lifeos-teal);
    }
  `,
  template: `
    @if (progress(); as p) {
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
        <span class="fw-semibold">
          {{ money(p.saved, p.targetCurrency) }}
          <span class="text-body-secondary fw-normal"
            >of {{ money(p.targetAmount, p.targetCurrency) }}</span
          >
        </span>
        <span class="small">{{ p.percent }}%</span>
      </div>
      <div class="savings-track" role="img" [attr.aria-label]="p.percent + '% of the target saved'">
        <div class="savings-fill" [style.width.%]="p.percent"></div>
      </div>
      @if (p.items.length === 0) {
        <p class="small text-body-secondary mt-2 mb-0">
          Link the accounts or investments that hold this money (Linked items below) and they count
          here.
        </p>
      } @else {
        <ul class="list-unstyled small mt-2 mb-0">
          @for (i of p.items; track i.type + i.id) {
            <li class="d-flex justify-content-between gap-2">
              <span class="text-break">{{ i.name }}</span>
              @if (i.inBase === null) {
                <span class="text-body-secondary"
                  >{{ money(i.amount, i.currency) }} · not in {{ p.targetCurrency }}</span
                >
              } @else {
                <span>{{ money(i.inBase, p.targetCurrency) }}</span>
              }
            </li>
          }
        </ul>
      }
      <button type="button" class="btn btn-link btn-sm p-0 mt-1" (click)="load()">Refresh</button>
    } @else if (failed()) {
      <p class="small text-body-secondary mb-0">
        Couldn't work out the savings just now.
        <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
          Try again
        </button>
      </p>
    }
  `,
})
export class SavingsProgress {
  private readonly financeService = inject(FinanceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly goalId = input.required<number>();
  /** Anything that changes when the target may have (the goal page passes its target). */
  readonly version = input<string>('');

  protected readonly money = formatMoney;
  protected readonly progress = signal<Progress | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      this.goalId();
      this.version();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.financeService
      .savings(this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (progress) => {
          this.progress.set(progress);
          this.failed.set(false);
        },
        error: () => this.failed.set(true),
      });
  }
}
