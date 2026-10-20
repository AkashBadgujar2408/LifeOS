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
import { RouterLink } from '@angular/router';
import { GoalCountedBy, GoalsService } from '../../../core/services/goals.service';
import { formatAmount, measureLine } from '../../../features/goals/goal-measure';

/**
 * "Counts toward": the goals an item feeds (a habit, a skill, a project…), shown on the item's own page — the other
 * end of a goal's "Counted from". Renders nothing when the item counts toward no goal. Pass `version` to re-read
 * after something that changes the figures (a habit ticked on the same page).
 */
@Component({
  selector: 'app-counts-toward',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (goals().length > 0) {
      <div class="card">
        <div class="card-body">
          <h2 class="h6 mb-3">Counts toward</h2>
          <ul class="list-unstyled mb-0 d-flex flex-column gap-3">
            @for (g of goals(); track g.goalId) {
              <li>
                <div class="d-flex justify-content-between gap-2">
                  <a [routerLink]="['/goals', g.goalId]" class="text-truncate min-w-0">{{
                    g.goalTitle
                  }}</a>
                  <span class="small fw-semibold flex-shrink-0">
                    @if (g.locked) {
                      <i class="bi bi-lock"></i> Locked
                    } @else {
                      {{ g.percent }}%
                    }
                  </span>
                </div>
                @if (!g.locked) {
                  <div
                    class="progress mt-1"
                    style="height: 0.35rem"
                    role="progressbar"
                    [attr.aria-label]="g.goalTitle + ' progress'"
                    [attr.aria-valuenow]="g.percent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div class="progress-bar" [style.width.%]="g.percent"></div>
                  </div>
                  <div class="small text-body-secondary mt-1">
                    @if (g.measureTarget !== null && g.measureUnit) {
                      {{ measureLine(g.measureCurrent, g.measureTarget, g.measureUnit) }}
                      @if (g.counted !== null) {
                        · {{ formatAmount(g.counted) }} from this
                      }
                    }
                    @if (g.status !== 'Active') {
                      · {{ g.status }}
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </div>
      </div>
    }
  `,
})
export class CountsToward {
  private readonly goalsService = inject(GoalsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<number>();
  readonly version = input<unknown>(null);

  protected readonly goals = signal<GoalCountedBy[]>([]);
  protected readonly measureLine = measureLine;
  protected readonly formatAmount = formatAmount;

  constructor() {
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      this.version();
      untracked(() =>
        this.goalsService
          .countsToward(type, id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          // A side card: if it can't load, the page is still whole without it.
          .subscribe({ next: (goals) => this.goals.set(goals), error: () => this.goals.set([]) }),
      );
    });
  }
}
