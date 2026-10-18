import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Insight } from '../../core/services/dashboard.service';
import { insightLink } from './my-day-view';

/**
 * The rule-based insights (DashboardInsights on the API) as a short list: a nudge or a cheer icon, the sentence, and
 * a link to where acting on it happens. Used on My Day (dismissible: hidden until its situation changes) and the
 * weekly reflection; the host owns the card around it and the dismiss call.
 */
@Component({
  selector: 'app-insights-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <ul class="list-unstyled mb-0 d-flex flex-column gap-3">
      @for (insight of insights(); track insight.key) {
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
          @if (dismissible()) {
            <button
              type="button"
              class="btn btn-link btn-sm p-0 lh-1 link-secondary flex-shrink-0"
              title="Hide until things change"
              aria-label="Hide this until things change"
              (click)="dismiss.emit(insight)"
            >
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
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
  /** Shows a hide button on each insight; the host dismisses it through the API. */
  readonly dismissible = input(false);
  readonly dismiss = output<Insight>();

  protected readonly link = insightLink;
}
