import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FamilyPerson, FamilyService } from '../../core/services/family.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { treeGenerations, unplaced } from './family-view';

/**
 * The family tree as nested lists, one generation each, oldest at the top — readable at any width, no graph library.
 * Where someone sits and what they are to you are the API's (FamilyTree); relationships are added on a person's page.
 */
@Component({
  selector: 'app-family-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Family tree</h1>
        <p class="text-body-secondary mb-0 small">
          Who's who, by generation. Open a person to say how they're related.
        </p>
      </div>

      @if (loadFailed() && !people()) {
        <app-load-error message="Couldn't load your family tree." (retry)="load()" />
      } @else if (people()) {
        @if (placedCount() === 0) {
          <p class="text-body-secondary">
            Nobody in the tree yet. Open someone in
            <a routerLink="/family/people">People</a> and add how they're related to you — your
            parents, partner, children — and the tree grows from there.
          </p>
        }
        <ol class="list-unstyled d-flex flex-column gap-3 mb-4">
          @for (g of generations(); track g.generation) {
            <li>
              <section class="card" [attr.aria-labelledby]="'gen-' + g.generation">
                <div class="card-body p-3 p-md-4">
                  <h2 [id]="'gen-' + g.generation" class="h6 text-body-secondary mb-2">
                    {{ g.heading }}
                  </h2>
                  <ul class="list-unstyled d-flex flex-wrap gap-2 mb-0">
                    @if (g.generation === 0) {
                      <li class="border rounded px-3 py-2 fw-semibold">You</li>
                    }
                    @for (p of g.people; track p.contactId) {
                      <li class="border rounded px-3 py-2 min-w-0">
                        <a
                          [routerLink]="['/family/people', p.contactId]"
                          class="fw-semibold text-break"
                          >{{ p.name }}</a
                        >
                        <div class="small text-body-secondary">{{ p.relation }}</div>
                      </li>
                    }
                  </ul>
                </div>
              </section>
            </li>
          }
        </ol>

        @if (others().length > 0) {
          <section class="card" aria-labelledby="tree-others">
            <div class="card-body p-3 p-md-4">
              <h2 id="tree-others" class="h6 text-body-secondary mb-2">Also family</h2>
              <p class="small text-body-secondary">
                Related to you in another way, or connected to others but not yet to you.
              </p>
              <ul class="list-unstyled d-flex flex-wrap gap-2 mb-0">
                @for (p of others(); track p.contactId) {
                  <li class="border rounded px-3 py-2 min-w-0">
                    <a
                      [routerLink]="['/family/people', p.contactId]"
                      class="fw-semibold text-break"
                      >{{ p.name }}</a
                    >
                    <div class="small text-body-secondary">
                      {{ p.relation ?? 'Not connected to you yet' }}
                    </div>
                  </li>
                }
              </ul>
            </div>
          </section>
        }
      } @else {
        <p class="text-body-secondary">Loading…</p>
      }
    </div>
  `,
})
export class FamilyTree implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly people = signal<FamilyPerson[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly generations = computed(() => treeGenerations(this.people() ?? []));
  protected readonly others = computed(() => unplaced(this.people() ?? []));
  protected readonly placedCount = computed(
    () => (this.people() ?? []).filter((p) => p.generation !== null).length,
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.familyService
      .people()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => this.people.set(people),
        error: () => this.loadFailed.set(true),
      });
  }
}
