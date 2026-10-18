import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import {
  GOAL_STATUSES,
  GOAL_TYPE_LABELS,
  GoalStatus,
  GoalSummary,
  GoalsService,
} from '../../core/services/goals.service';
import { LifeArea, LifeAreasService } from '../../core/services/life-areas.service';
import { isOverdue } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';
import { LifeVision } from './life-vision';

@Component({
  selector: 'app-goals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, DatePipe, RouterLink, LifeVision],
  templateUrl: './goals.html',
})
export class Goals implements OnInit {
  private readonly goalsService = inject(GoalsService);
  private readonly lifeAreasService = inject(LifeAreasService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = GOAL_STATUSES;
  protected readonly typeLabels = GOAL_TYPE_LABELS;
  protected readonly isOverdue = isOverdue;

  protected readonly goals = signal<GoalSummary[]>([]);
  protected readonly lifeAreas = signal<LifeArea[]>([]);
  protected readonly loading = signal(true);
  /** The last load failed: show the retry block, not the empty state (which would say "you have none"). */
  protected readonly loadFailed = signal(false);
  protected readonly statusFilter = signal<GoalStatus | null>('Active');
  protected readonly lifeAreaFilter = signal<number | null>(null);

  /** Counts per status within the selected life area, so the pills match what clicking them would show. */
  protected readonly statusCounts = computed(() => {
    const counts = new Map<GoalStatus, number>();
    for (const goal of this.inLifeArea()) {
      counts.set(goal.status, (counts.get(goal.status) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly visibleGoals = computed(() => {
    const status = this.statusFilter();
    return status ? this.inLifeArea().filter((g) => g.status === status) : this.inLifeArea();
  });

  private readonly inLifeArea = computed(() => {
    const areaId = this.lifeAreaFilter();
    return areaId ? this.goals().filter((g) => g.lifeAreaId === areaId) : this.goals();
  });

  ngOnInit(): void {
    this.lifeAreasService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (areas) => this.lifeAreas.set(areas) });

    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.goalsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (goals) => {
          this.goals.set(goals);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your goals.'));
        },
      });
  }

  protected setLifeAreaFilter(value: string): void {
    this.lifeAreaFilter.set(value ? Number(value) : null);
  }
}
