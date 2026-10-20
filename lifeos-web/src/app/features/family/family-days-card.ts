import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { UpcomingDay } from '../../core/services/family.service';
import { DATE_KIND_ICONS, whenText } from './family-view';

/**
 * My Day's "Birthdays & anniversaries" card: what comes round from today to a week ahead.
 */
@Component({
  selector: 'app-family-days-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="card" aria-labelledby="family-days-heading">
      <div class="card-body p-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h2 id="family-days-heading" class="h5 mb-0">Birthdays &amp; anniversaries</h2>
          <a routerLink="/family" class="small">Family</a>
        </div>
        <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
          @for (d of days(); track d.id) {
            <li class="d-flex flex-wrap align-items-center gap-2">
              <i class="bi {{ icons[d.kind] }} text-body-secondary" aria-hidden="true"></i>
              <a [routerLink]="['/family/people', d.contactId]" class="fw-semibold me-auto">{{
                d.title
              }}</a>
              <span class="badge text-bg-light border">{{ when(d.daysUntil) }}</span>
              <span class="small text-body-secondary">{{ d.on | date }}</span>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class FamilyDaysCard {
  readonly days = input.required<UpcomingDay[]>();

  protected readonly icons = DATE_KIND_ICONS;
  protected readonly when = whenText;
}
