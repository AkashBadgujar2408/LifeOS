import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, switchMap } from 'rxjs';
import Swal from 'sweetalert2';
import { Contact, ContactsService } from '../../core/services/contacts.service';
import {
  FamilyPerson,
  FamilyService,
  Relationship,
  SignificantDate,
} from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openContactEditor } from '../contacts/contact-editor';
import { DateForm } from './date-form';
import { RelationshipForm } from './relationship-form';
import {
  DATE_KIND_ICONS,
  dayLabel,
  relationshipFromView,
  relationshipsOf,
  whenText,
} from './family-view';

/**
 * One person (a shared contact) as Family sees them: how to reach them, how they're related — to you and to others
 * — and the days to remember. Their details are edited in the shared contact editor.
 */
@Component({
  selector: 'app-family-person',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, RelationshipForm, DateForm],
  template: `
    <div class="container py-4">
      <a routerLink="/family/people" class="small d-inline-block mb-2">
        <i class="bi bi-arrow-left"></i> People
      </a>

      @if (loadFailed() && !contact()) {
        <app-load-error message="Couldn't load this person." (retry)="reload()" />
      } @else if (contact(); as contact) {
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-4">
          <div class="min-w-0">
            <h1 class="h3 mb-1 text-break">{{ contact.name }}</h1>
            <div class="small text-body-secondary">
              @if (person()?.relation; as relation) {
                <span class="badge text-bg-light border me-1">{{ relation }}</span>
              }
              @if (contact.phone) {
                <a [href]="'tel:' + contact.phone" class="me-2">{{ contact.phone }}</a>
              }
              @if (contact.email) {
                <a [href]="'mailto:' + contact.email" class="me-2 text-break">{{
                  contact.email
                }}</a>
              }
              @if (contact.lastContactedOn) {
                <span>Last in touch {{ contact.lastContactedOn | date }}</span>
              }
            </div>
          </div>
          <button
            type="button"
            class="btn btn-outline-primary btn-sm"
            (click)="editContact(contact)"
          >
            <i class="bi bi-pencil"></i> Edit details
          </button>
        </div>

        <div class="row g-3">
          <div class="col-12 col-lg-6">
            <section class="card h-100" aria-labelledby="person-relations">
              <div class="card-body p-4">
                <h2 id="person-relations" class="h5 mb-3">How they're related</h2>
                @if (relations().length === 0) {
                  <p class="small text-body-secondary">
                    Not in the family tree yet. Say how {{ contact.name }} is related to you or to
                    someone else, and the tree places them.
                  </p>
                } @else {
                  <ul class="list-group list-group-flush border-top mb-3">
                    @for (r of relations(); track r.id) {
                      <li class="list-group-item px-0 d-flex align-items-center gap-2">
                        <span class="flex-grow-1 text-break">{{ describe(r) }}</span>
                        <button
                          type="button"
                          class="btn btn-sm btn-link text-body-secondary p-0"
                          [attr.aria-label]="'Remove: ' + describe(r)"
                          (click)="removeRelationship(r)"
                        >
                          <i class="bi bi-x-lg"></i>
                        </button>
                      </li>
                    }
                  </ul>
                }
                @if (addingRelation()) {
                  <app-relationship-form
                    [contactId]="contact.id"
                    [name]="contact.name"
                    [people]="people()"
                    (added)="relationAdded()"
                    (cancelled)="addingRelation.set(false)"
                  />
                } @else {
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    (click)="addingRelation.set(true)"
                  >
                    <i class="bi bi-plus-lg"></i> Add a relationship
                  </button>
                }
              </div>
            </section>
          </div>

          <div class="col-12 col-lg-6">
            <section class="card h-100" aria-labelledby="person-days">
              <div class="card-body p-4">
                <h2 id="person-days" class="h5 mb-3">Days to remember</h2>
                @if (days().length === 0 && editingDate() === undefined) {
                  <p class="small text-body-secondary">
                    No birthday or anniversary yet. Add one and it shows on the calendar every year,
                    and on My Day the week before.
                  </p>
                }
                @if (days().length > 0) {
                  <ul class="list-group list-group-flush border-top mb-3">
                    @for (d of days(); track d.id) {
                      <li class="list-group-item px-0 d-flex align-items-start gap-2">
                        <i
                          class="bi {{ icons[d.kind] }} mt-1 text-body-secondary"
                          aria-hidden="true"
                        ></i>
                        <div class="flex-grow-1 min-w-0">
                          <div class="text-break">{{ d.title }}</div>
                          <div class="small text-body-secondary">
                            {{ dayLabel(d.month, d.day, d.year) }} · {{ when(d.daysUntil) }}
                            @if (d.daysUntil > 1) {
                              ({{ d.nextOn | date }})
                            }
                            @if (d.notes) {
                              · {{ d.notes }}
                            }
                          </div>
                        </div>
                        <button
                          type="button"
                          class="btn btn-sm btn-link text-body-secondary p-0"
                          [attr.aria-label]="'Change ' + d.title"
                          (click)="editingDate.set(d)"
                        >
                          <i class="bi bi-pencil"></i>
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-link text-body-secondary p-0"
                          [attr.aria-label]="'Remove ' + d.title"
                          (click)="removeDate(d)"
                        >
                          <i class="bi bi-x-lg"></i>
                        </button>
                      </li>
                    }
                  </ul>
                }
                @if (editingDate() !== undefined) {
                  <app-date-form
                    [contactId]="contact.id"
                    [people]="people()"
                    [date]="editingDate() ?? null"
                    (saved)="dateSaved()"
                    (cancelled)="editingDate.set(undefined)"
                  />
                } @else {
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    (click)="editingDate.set(null)"
                  >
                    <i class="bi bi-plus-lg"></i> Add a day
                  </button>
                }
              </div>
            </section>
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading…</p>
      }
    </div>
  `,
})
export class FamilyPersonPage {
  private readonly contactsService = inject(ContactsService);
  private readonly familyService = inject(FamilyService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  protected readonly icons = DATE_KIND_ICONS;
  protected readonly dayLabel = dayLabel;
  protected readonly when = whenText;
  protected readonly contact = signal<Contact | null>(null);
  protected readonly people = signal<FamilyPerson[]>([]);
  private readonly relationships = signal<Relationship[]>([]);
  private readonly dates = signal<SignificantDate[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly addingRelation = signal(false);
  /** undefined: not editing; null: adding; a date: changing it. */
  protected readonly editingDate = signal<SignificantDate | null | undefined>(undefined);

  private readonly contactId = computed(() => Number(this.id()));
  protected readonly person = computed(
    () => this.people().find((p) => p.contactId === this.contactId()) ?? null,
  );
  protected readonly relations = computed(() =>
    relationshipsOf(this.relationships(), this.contactId()),
  );
  /** Their own days and anniversaries they share with someone. */
  protected readonly days = computed(() =>
    this.dates().filter(
      (d) => d.contactId === this.contactId() || d.otherContactId === this.contactId(),
    ),
  );

  constructor() {
    itemTitle(() => this.contact()?.name);
    toObservable(this.contactId)
      .pipe(
        switchMap((id) => this.loadAll(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: (data) => this.apply(data), error: () => this.loadFailed.set(true) });
  }

  protected reload(): void {
    this.loadFailed.set(false);
    this.loadAll(this.contactId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.apply(data), error: () => this.loadFailed.set(true) });
  }

  protected describe(r: Relationship): string {
    return relationshipFromView(r, this.contactId());
  }

  protected async editContact(contact: Contact): Promise<void> {
    const result = await openContactEditor(this.modal, contact);
    if (result?.kind === 'deleted') {
      this.toast.success('Contact deleted.');
      void this.router.navigate(['/family/people']);
    } else if (result) {
      this.reload();
    }
  }

  protected relationAdded(): void {
    this.addingRelation.set(false);
    this.reload();
  }

  protected async removeRelationship(r: Relationship): Promise<void> {
    const result = await Swal.fire({
      title: 'Remove this relationship?',
      text: `${this.describe(r)} — the people stay, only the link between them goes.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!result.isConfirmed) {
      return;
    }
    this.familyService
      .removeRelationship(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove it.')),
      });
  }

  protected dateSaved(): void {
    this.editingDate.set(undefined);
    this.reload();
  }

  protected async removeDate(d: SignificantDate): Promise<void> {
    const result = await Swal.fire({
      title: `Remove ${d.title}?`,
      text: 'It stops showing on the calendar and My Day.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }
    this.familyService
      .removeDate(d.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reload(),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove it.')),
      });
  }

  private loadAll(id: number) {
    return forkJoin({
      contact: this.contactsService.get(id),
      people: this.familyService.people(),
      relationships: this.familyService.relationships(),
      dates: this.familyService.dates(),
    });
  }

  private apply(data: {
    contact: Contact;
    people: FamilyPerson[];
    relationships: Relationship[];
    dates: SignificantDate[];
  }): void {
    this.contact.set(data.contact);
    this.people.set(data.people);
    this.relationships.set(data.relationships);
    this.dates.set(data.dates);
    this.loadFailed.set(false);
  }
}
