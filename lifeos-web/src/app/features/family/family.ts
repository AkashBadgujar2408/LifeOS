import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { FamilyPerson, FamilyService, SignificantDate } from '../../core/services/family.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { DATE_KIND_ICONS, whenText } from './family-view';

/** How far ahead "Coming up" looks. */
const COMING_UP_DAYS = 60;

/** Family at a glance: the birthdays and anniversaries coming up, and the way into People and the tree. */
@Component({
  selector: 'app-family',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Family &amp; relationships</h1>
        <p class="text-body-secondary mb-0 small">
          The people who matter and the days that matter to them — a memory aid, never a score.
        </p>
      </div>

      @if (loadFailed() && !people()) {
        <app-load-error message="Couldn't load your family." (retry)="load()" />
      } @else if (people(); as people) {
        <div class="row g-3 mb-4">
          @for (link of links(); track link.label) {
            <div class="col-6 col-lg-3">
              <a
                [routerLink]="link.route"
                class="card h-100 text-decoration-none link-body-emphasis"
              >
                <div class="card-body">
                  <i class="bi {{ link.icon }} text-body-secondary" aria-hidden="true"></i>
                  <div class="h4 mb-0 mt-1">{{ link.count }}</div>
                  <div class="small text-body-secondary">{{ link.label }}</div>
                </div>
              </a>
            </div>
          }
        </div>

        <section class="card" aria-labelledby="family-coming-up">
          <div class="card-body p-4">
            <h2 id="family-coming-up" class="h5 mb-3">Coming up</h2>
            @if (comingUp().length === 0) {
              <p class="text-body-secondary small mb-0">
                No birthdays or anniversaries in the next {{ window }} days. Add them on a person's
                page and they show here, on the calendar and on My Day.
              </p>
            } @else {
              <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
                @for (d of comingUp(); track d.id) {
                  <li class="d-flex flex-wrap align-items-center gap-2">
                    <i class="bi {{ icons[d.kind] }} text-body-secondary" aria-hidden="true"></i>
                    <a
                      [routerLink]="['/family/people', d.contactId]"
                      class="fw-semibold me-auto text-break"
                      >{{ d.title }}</a
                    >
                    <span class="badge text-bg-light border">{{ when(d.daysUntil) }}</span>
                    <span class="small text-body-secondary">{{ d.nextOn | date }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        </section>
      } @else {
        <p class="text-body-secondary">Loading…</p>
      }
    </div>
  `,
})
export class Family implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly window = COMING_UP_DAYS;
  protected readonly icons = DATE_KIND_ICONS;
  protected readonly when = whenText;
  protected readonly people = signal<FamilyPerson[] | null>(null);
  private readonly dates = signal<SignificantDate[]>([]);
  protected readonly loadFailed = signal(false);

  protected readonly comingUp = computed(() =>
    this.dates().filter((d) => d.daysUntil <= COMING_UP_DAYS),
  );
  protected readonly links = computed(() => {
    const people = this.people() ?? [];
    return [
      {
        route: '/family/people',
        icon: 'bi-people',
        label: 'People in your family',
        count: people.filter((p) => p.isFamily).length,
      },
      {
        route: '/family/tree',
        icon: 'bi-diagram-3',
        label: 'Generations in the tree',
        count: new Set(people.filter((p) => p.generation !== null).map((p) => p.generation)).size,
      },
      {
        route: '/family/people',
        icon: 'bi-cake2',
        label: 'Birthdays remembered',
        count: this.dates().filter((d) => d.kind === 'Birthday').length,
      },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    forkJoin({ people: this.familyService.people(), dates: this.familyService.dates() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ people, dates }) => {
          this.people.set(people);
          this.dates.set(dates);
        },
        error: () => this.loadFailed.set(true),
      });
  }
}
