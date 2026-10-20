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
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FamilyPerson, FamilyService } from '../../core/services/family.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openContactEditor } from '../contacts/contact-editor';

type PeopleFilter = 'family' | 'everyone';

/**
 * The people directory: the one shared contact list, as Family sees it — how each person is related to you and when
 * their birthday comes round. "Family" shows only people in the tree; "Everyone" the whole list.
 */
@Component({
  selector: 'app-family-people',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">People</h1>
          <p class="text-body-secondary mb-0 small">
            Everyone you keep in LifeOS — one list shared with Career and the rest.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="addPerson()">
          <i class="bi bi-plus-lg"></i> Add a person
        </button>
      </div>

      <div class="d-flex flex-wrap gap-2 mb-3">
        <div class="btn-group" role="group" aria-label="Who to show">
          <input
            type="radio"
            class="btn-check"
            name="people-filter"
            id="people-family"
            [checked]="filter() === 'family'"
            (change)="filter.set('family')"
          />
          <label class="btn btn-outline-primary btn-sm" for="people-family">Family</label>
          <input
            type="radio"
            class="btn-check"
            name="people-filter"
            id="people-everyone"
            [checked]="filter() === 'everyone'"
            (change)="filter.set('everyone')"
          />
          <label class="btn btn-outline-primary btn-sm" for="people-everyone">Everyone</label>
        </div>
        <input
          type="search"
          class="form-control form-control-sm"
          style="max-width: 18rem"
          aria-label="Find a person"
          placeholder="Find by name, phone or email"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </div>

      @if (loadFailed() && !people()) {
        <app-load-error message="Couldn't load your people." (retry)="load()" />
      } @else if (people(); as all) {
        @if (shown().length === 0) {
          <p class="text-body-secondary">
            @if (search()) {
              Nobody matches "{{ search() }}".
            } @else if (filter() === 'family' && all.length > 0) {
              Nobody is in your family tree yet. Open a person and say how they're related.
            } @else {
              No people yet. Add someone to start.
            }
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (p of shown(); track p.contactId) {
                <li class="list-group-item py-3">
                  <div class="d-flex flex-wrap align-items-center gap-2">
                    <a
                      [routerLink]="['/family/people', p.contactId]"
                      class="fw-semibold me-auto text-break"
                      >{{ p.name }}</a
                    >
                    @if (p.relation) {
                      <span class="badge text-bg-light border">{{ p.relation }}</span>
                    }
                  </div>
                  <div class="small text-body-secondary">
                    @if (p.nextBirthday) {
                      <i class="bi bi-cake2" aria-hidden="true"></i>
                      {{ p.turnsAge ? 'Turns ' + p.turnsAge + ' on' : 'Birthday' }}
                      {{ p.nextBirthday | date }}
                    }
                    @if (p.phone) {
                      <span class="ms-2">{{ p.phone }}</span>
                    }
                    @if (p.email) {
                      <span class="ms-2 text-break">{{ p.email }}</span>
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading…</p>
      }
    </div>
  `,
})
export class FamilyPeople implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly people = signal<FamilyPerson[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly filter = signal<PeopleFilter>('family');
  protected readonly search = signal('');

  protected readonly shown = computed(() => {
    const term = this.search().trim().toLowerCase();
    return (this.people() ?? []).filter(
      (p) =>
        (this.filter() === 'everyone' || p.isFamily) &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          (p.phone ?? '').toLowerCase().includes(term) ||
          (p.email ?? '').toLowerCase().includes(term)),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.familyService
      .people()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => {
          this.people.set(people);
          // With nobody in the tree yet, show everyone rather than an empty page.
          if (!people.some((p) => p.isFamily)) {
            this.filter.set('everyone');
          }
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async addPerson(): Promise<void> {
    const result = await openContactEditor(this.modal);
    if (result?.kind === 'saved') {
      void this.router.navigate(['/family/people', result.contact.id]);
    }
  }
}
