import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { DashboardService, LifeBalanceArea } from '../../core/services/dashboard.service';
import { balanceSummary, joinNames } from './my-day-view';
import { SettingsService } from '../../core/services/settings.service';

/**
 * The Life Balance "wheel", drawn as one horizontal bar per life area (the dataviz guidance: comparing magnitude
 * across categories is a bar job — a radar distorts area and is hard to read). Fixed taxonomy order so it compares
 * week to week, one hue (sequential job), the score as text beside every bar, and the breakdown on hover/focus.
 * Fetches its own data for the window it's given.
 */
@Component({
  selector: 'app-life-balance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgbTooltip],
  template: `
    @if (balance.value(); as data) {
      @let summary = sentence();
      @if (summary) {
        <p class="small text-body-secondary mb-3">{{ summary }}</p>
      }
      <ul class="list-unstyled mb-0 d-flex flex-column gap-2" aria-label="Activity per life area">
        @for (area of areas(); track area.lifeAreaId) {
          <li
            class="balance-row"
            tabindex="0"
            [ngbTooltip]="breakdown(area)"
            container="body"
            [attr.aria-label]="area.lifeAreaName + ': ' + area.score + ' of 10. ' + breakdown(area)"
          >
            <span class="small text-truncate">{{ area.lifeAreaName }}</span>
            <span class="balance-track" aria-hidden="true">
              @if (area.score > 0) {
                <span class="balance-bar" [style.width.%]="area.score * 10"></span>
              }
            </span>
            <span class="small fw-semibold text-end" aria-hidden="true">{{ area.score }}</span>
          </li>
        }
      </ul>
    } @else if (balance.error()) {
      <p class="text-body-secondary mb-0">Couldn't load the balance.</p>
    } @else {
      <p class="text-body-secondary mb-0">Adding it up...</p>
    }
  `,
  styles: `
    .balance-row {
      display: grid;
      grid-template-columns: minmax(0, 7.5rem) 1fr 2.25rem;
      align-items: center;
      gap: 0.75rem;
      border-radius: 4px;
      cursor: default;
    }
    .balance-row:focus-visible {
      outline: 2px solid var(--lifeos-teal);
      outline-offset: 2px;
    }
    .balance-track {
      height: 0.5rem;
      border-radius: 4px;
      background: var(--lifeos-border);
      overflow: hidden;
    }
    .balance-bar {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--lifeos-teal);
    }
  `,
})
export class LifeBalance {
  private readonly dashboardService = inject(DashboardService);

  /** Local days "yyyy-MM-dd", inclusive. */
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  private readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;

  protected readonly balance = rxResource({
    params: () => ({ from: this.from(), to: this.to() }),
    stream: ({ params }) => this.dashboardService.getLifeBalance(params.from, params.to),
  });

  /** The areas switched on in Settings. */
  protected readonly areas = computed(() =>
    (this.balance.value()?.areas ?? []).filter((a) => !this.hiddenAreaIds().has(a.lifeAreaId)),
  );

  protected readonly sentence = computed(() => {
    const data = this.balance.value();
    if (!data) {
      return null;
    }
    const { busiest, quiet } = balanceSummary(this.areas());
    if (busiest.length === 0) {
      return 'Nothing logged against a life area in this period yet. Goals, habits and journal entries filed under an area show up here.';
    }
    const parts = [`Most of your effort went to ${joinNames(busiest)}.`];
    if (quiet.length > 0) {
      parts.push(`Nothing yet in ${joinNames(quiet)}.`);
    }
    return parts.join(' ');
  });

  protected breakdown(area: LifeBalanceArea): string {
    const parts = [
      [area.goalsCompleted, 'goal completed', 'goals completed'],
      [area.milestonesCompleted, 'milestone done', 'milestones done'],
      [area.habitTicks, 'habit day', 'habit days'],
      [area.journalEntries, 'journal entry', 'journal entries'],
      [area.activeGoals, 'active goal', 'active goals'],
    ] as const;
    const text = parts
      .filter(([count]) => count > 0)
      .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
      .join(' · ');
    return text || 'Nothing in this period';
  }
}
