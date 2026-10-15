import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Insight } from '../../core/services/dashboard.service';
import { insightLink } from './my-day-view';

/**
 * The rule-based insights (DashboardInsights on the API) as a short list: a nudge or a cheer icon, the sentence, and
 * a link to where acting on it happens. Used on My Day and the weekly reflection; the host owns the card around it.
 */
@Component({
  selector: 'app-insights-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <ul class="list-unstyled mb-0 d-flex flex-column gap-3">
      @for (insight of insights(); track $index) {
        @let target = link(insight);
        <li class="d-flex align-items-start gap-3">
          @if (insight.tone === 'Cheer') {
            <i class="bi bi-stars insight-cheer fs-5 lh-1" aria-hidden="true"></i>
          } @else {
            <i class="bi bi-signpost-2 insight-nudge fs-5 lh-1" aria-hidden="true"></i>
          }
          <div class="flex-grow-1 min-w-0">
            <span class="visually-hidden">{{
              insight.tone === 'Cheer' ? 'Good news:' : 'Nudge:'
            }}</span>
            {{ insight.message }}
          </div>
          @if (target) {
            <a [routerLink]="target.link" class="small flex-shrink-0">{{ target.label }}</a>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .insight-nudge {
      color: var(--lifeos-amber);
    }
    .insight-cheer {
      color: var(--lifeos-teal);
    }
  `,
})
export class InsightsList {
  readonly insights = input.required<Insight[]>();

  protected readonly link = insightLink;
}
