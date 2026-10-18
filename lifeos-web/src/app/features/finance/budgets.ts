import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { BudgetLine, FinanceService, MonthSummary } from '../../core/services/finance.service';
import { TagsService } from '../../core/services/tags.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { budgetBar, formatMoney, monthLabel, monthRange, shiftMonth } from './finance-view';

/**
 * A month's budgets per tag against what was spent (in the base currency), plain bars like Life balance: full at
 * the budget, the overspend said in words. Budgets are set per month; a new month starts empty until last month's
 * are copied forward.
 */
@Component({
  selector: 'app-finance-budgets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, LoadError, BaseCurrencyPrompt],
  styles: `
    .budget-track {
      height: 0.6rem;
      border-radius: 999px;
      background: var(--lifeos-canvas);
      border: 1px solid var(--lifeos-border);
      overflow: hidden;
    }
    .budget-fill {
      height: 100%;
      background: var(--lifeos-teal);
    }
    .budget-fill.over {
      background: var(--lifeos-amber);
    }
  `,
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Budgets</h1>
          <p class="text-body-secondary mb-0 small">
            What you mean to spend on each tag this month, against what you did.
          </p>
        </div>
        <div class="btn-group" role="group" aria-label="Month">
          <button
            type="button"
            class="btn btn-outline-secondary"
            aria-label="Previous month"
            (click)="move(-1)"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <span class="btn btn-outline-secondary disabled text-body fw-semibold" aria-live="polite">
            {{ label() }}
          </span>
          <button
            type="button"
            class="btn btn-outline-secondary"
            aria-label="Next month"
            (click)="move(1)"
          >
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !summary()) {
        <app-load-error message="Couldn't load this month's budgets." (retry)="load()" />
      } @else if (summary(); as s) {
        @if (s.currency; as currency) {
          <div class="d-flex flex-wrap gap-4 mb-3">
            <div>
              <div class="small text-body-secondary">Income</div>
              <div class="h5 mb-0">{{ money(s.income, currency) }}</div>
            </div>
            <div>
              <div class="small text-body-secondary">Spending</div>
              <div class="h5 mb-0">{{ money(s.spending, currency) }}</div>
            </div>
            <div>
              <div class="small text-body-secondary">Left after spending</div>
              <div class="h5 mb-0">{{ money(s.income - s.spending, currency) }}</div>
            </div>
            <div class="align-self-end small text-body-secondary">
              @if (s.untaggedSpending > 0) {
                {{ money(s.untaggedSpending, currency) }} spent without a tag ·
                <a routerLink="/finance/transactions">tag it in Transactions</a>
              }
              @if (s.unconverted > 0) {
                <span class="text-body-secondary">
                  · {{ s.unconverted }} in another currency without a rate, left out</span
                >
              }
            </div>
          </div>

          <div class="card mb-3">
            @if (s.lines.length === 0) {
              <div class="card-body text-body-secondary">
                No budgets or tagged spending this month.
                @if (canCopy()) {
                  <button type="button" class="btn btn-link p-0 align-baseline" (click)="copy()">
                    Copy {{ previousLabel() }}'s budgets
                  </button>
                }
              </div>
            } @else {
              <ul class="list-group list-group-flush">
                @for (line of s.lines; track line.tagId) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
                      <span class="fw-semibold text-break">{{ line.tagName }}</span>
                      <span class="small">
                        {{ money(line.spent, currency) }}
                        @if (line.budget !== null) {
                          <span class="text-body-secondary">
                            of {{ money(line.budget, line.budgetCurrency ?? currency) }}</span
                          >
                        }
                      </span>
                    </div>
                    @if (line.percentUsed !== null) {
                      <div
                        class="budget-track"
                        role="img"
                        [attr.aria-label]="line.percentUsed + '% of the budget used'"
                      >
                        <div
                          class="budget-fill"
                          [class.over]="bar(line).over"
                          [style.width.%]="bar(line).width"
                        ></div>
                      </div>
                    }
                    <div class="d-flex flex-wrap justify-content-between gap-2 mt-1 small">
                      <span class="text-body-secondary">
                        @if (line.isOver) {
                          <strong class="text-body"
                            >Over by {{ money(-line.remaining!, currency) }}</strong
                          >
                          · {{ line.percentUsed }}%
                        } @else if (line.remaining !== null) {
                          {{ money(line.remaining, currency) }} left · {{ line.percentUsed }}%
                        } @else if (line.budget !== null) {
                          Set in {{ line.budgetCurrency }} — not compared
                        } @else {
                          No budget
                        }
                        · {{ line.transactionCount }}
                        {{ line.transactionCount === 1 ? 'expense' : 'expenses' }}
                      </span>
                      @if (editing() === line.tagId) {
                        <span class="d-flex gap-1">
                          <label class="visually-hidden" [for]="'budget-' + line.tagId">
                            Budget for {{ line.tagName }}
                          </label>
                          <input
                            [id]="'budget-' + line.tagId"
                            type="number"
                            min="0"
                            step="1"
                            class="form-control form-control-sm"
                            style="width: 8rem"
                            placeholder="e.g. 8000"
                            [ngModel]="draft()"
                            (ngModelChange)="draft.set($event)"
                            (keydown.enter)="$event.preventDefault(); save(line.tagId)"
                          />
                          <button
                            type="button"
                            class="btn btn-sm btn-primary"
                            (click)="save(line.tagId)"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            (click)="editing.set(null)"
                          >
                            Cancel
                          </button>
                        </span>
                      } @else {
                        <span class="d-flex gap-2">
                          <button
                            type="button"
                            class="btn btn-link btn-sm p-0"
                            (click)="startEdit(line)"
                          >
                            {{ line.budget === null ? 'Set a budget' : 'Change' }}
                          </button>
                          @if (line.budget !== null) {
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 link-secondary"
                              (click)="clear(line)"
                            >
                              Remove
                            </button>
                          }
                        </span>
                      }
                    </div>
                    @if (fieldError() && editing() === line.tagId) {
                      <div class="invalid-feedback d-block">{{ fieldError() }}</div>
                    }
                  </li>
                }
              </ul>
            }
          </div>

          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label class="form-label small" for="budget-new-tag">Budget another tag</label>
              <select
                id="budget-new-tag"
                class="form-select form-select-sm"
                [ngModel]="newTagId()"
                (ngModelChange)="newTagId.set($event)"
              >
                <option [ngValue]="null" [selected]="newTagId() === null">Choose a tag…</option>
                @for (t of unbudgetedTags(); track t.id) {
                  <option [ngValue]="t.id" [selected]="t.id === newTagId()">{{ t.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="form-label small" for="budget-new-amount"
                >Amount ({{ currency }})</label
              >
              <input
                id="budget-new-amount"
                type="number"
                min="0"
                step="1"
                class="form-control form-control-sm"
                placeholder="e.g. 3000"
                [ngModel]="newAmount()"
                (ngModelChange)="newAmount.set($event)"
              />
            </div>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              [disabled]="newTagId() === null"
              (click)="addBudget()"
            >
              Add
            </button>
            @if (canCopy() && s.lines.length > 0) {
              <button type="button" class="btn btn-sm btn-link" (click)="copy()">
                Copy {{ previousLabel() }}'s budgets
              </button>
            }
          </div>
          @if (newError()) {
            <div class="invalid-feedback d-block">{{ newError() }}</div>
          }
          <p class="small text-body-secondary mt-3 mb-0">
            Tags come from your transactions — tag an expense "Groceries" and it counts here. An
            expense with two tags counts toward both.
          </p>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceBudgets {
  private readonly financeService = inject(FinanceService);
  private readonly tagsService = inject(TagsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly money = formatMoney;
  protected readonly bar = budgetBar;
  protected readonly month = signal(monthRange(todayIso()).from);
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly previousLabel = computed(
    () => monthLabel(shiftMonth(this.month(), -1)).split(' ')[0],
  );
  protected readonly summary = signal<MonthSummary | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly tags = toSignal(this.tagsService.list().pipe(catchError(() => of([]))), {
    initialValue: [],
  });

  protected readonly editing = signal<number | null>(null);
  protected readonly draft = signal<number | null>(null);
  protected readonly fieldError = signal<string | null>(null);
  protected readonly newTagId = signal<number | null>(null);
  protected readonly newAmount = signal<number | null>(null);
  protected readonly newError = signal<string | null>(null);

  /** Only offered while the month has no budget of its own yet for some tag — copying never overwrites. */
  protected readonly canCopy = computed(() => {
    const lines = this.summary()?.lines ?? [];
    return lines.every((l) => l.budget === null);
  });
  protected readonly unbudgetedTags = computed(() => {
    const budgeted = new Set(
      (this.summary()?.lines ?? []).filter((l) => l.budget !== null).map((l) => l.tagId),
    );
    return this.tags().filter((t) => !budgeted.has(t.id));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.financeService
      .month(this.month())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected move(delta: number): void {
    this.month.set(shiftMonth(this.month(), delta));
    this.editing.set(null);
    this.summary.set(null);
    this.load();
  }

  protected startEdit(line: BudgetLine): void {
    this.editing.set(line.tagId);
    this.draft.set(line.budget);
    this.fieldError.set(null);
    // The field only exists once it has rendered; put the cursor in it so the amount can be typed straight away.
    afterNextRender(() => document.getElementById(`budget-${line.tagId}`)?.focus(), {
      injector: this.injector,
    });
  }

  protected save(tagId: number): void {
    const amount = this.draft();
    if (amount === null || !(amount > 0)) {
      this.fieldError.set('Enter an amount above zero — or Remove the budget.');
      return;
    }
    this.apply(tagId, amount, () => this.editing.set(null));
  }

  protected clear(line: BudgetLine): void {
    this.apply(line.tagId, null);
  }

  protected addBudget(): void {
    const tagId = this.newTagId();
    const amount = this.newAmount();
    if (tagId === null) {
      return;
    }
    if (amount === null || !(amount > 0)) {
      this.newError.set('Enter an amount above zero.');
      return;
    }
    this.newError.set(null);
    this.apply(tagId, amount, () => {
      this.newTagId.set(null);
      this.newAmount.set(null);
    });
  }

  protected copy(): void {
    this.financeService.copyPreviousBudgets(this.month()).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.toast.success('Budgets copied.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not copy the budgets.')),
    });
  }

  private apply(tagId: number, amount: number | null, done?: () => void): void {
    this.financeService.setBudget(this.month(), tagId, amount).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.fieldError.set(null);
        done?.();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not save the budget.')),
    });
  }
}
