import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { FamilyPerson, FamilyService } from '../../core/services/family.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openContactEditor } from '../contacts/contact-editor';

type PeopleFilter = 'family' | 'everyone';

/**
 * The people directory: the one shared contact list, as Family sees it — how each person is related to you and when
 * their birthday comes round. "Family" shows only people in the tree; "Everyone" the whole list (a data grid:
 * sort, page, export; a row opens the person).
 */
@Component({
  selector: 'app-family-people',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, DataGrid],
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
          <app-data-grid
            name="people"
            [rows]="shown()"
            [columns]="columns"
            [phoneColumns]="['name', 'relation', 'nextBirthday']"
            [rowId]="rowId"
            [noun]="['person', 'people']"
            (open)="openPerson($event)"
          />
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
  private readonly locale = inject(LOCALE_ID);

  protected readonly people = signal<FamilyPerson[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly filter = signal<PeopleFilter>('family');
  protected readonly search = signal('');
  protected readonly rowId = (p: FamilyPerson) => p.contactId;
  protected readonly columns: ColDef<FamilyPerson>[] = [
    { headerName: 'Name', field: 'name', flex: 1.5, minWidth: 150, sort: 'asc' },
    { headerName: 'To you', field: 'relation', flex: 1, minWidth: 120 },
    {
      headerName: 'Next birthday',
      field: 'nextBirthday',
      width: 140,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'Turns', field: 'turnsAge', width: 90, type: 'rightAligned' },
    {
      headerName: 'Last in touch',
      field: 'lastContactedOn',
      width: 135,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'Phone', field: 'phone', width: 140 },
    { headerName: 'Email', field: 'email', flex: 1, minWidth: 160 },
  ];

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

  protected openPerson(person: FamilyPerson): void {
    void this.router.navigate(['/family/people', person.contactId]);
  }

  protected async addPerson(): Promise<void> {
    const result = await openContactEditor(this.modal);
    if (result?.kind === 'saved') {
      void this.router.navigate(['/family/people', result.contact.id]);
    }
  }
}
