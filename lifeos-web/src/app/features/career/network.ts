import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { CareerService } from '../../core/services/career.service';
import { Contact, ContactsService } from '../../core/services/contacts.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openContactEditor } from '../contacts/contact-editor';
import { CATCH_UP_DAYS, contactedText, networkOrder } from './career-view';

/**
 * Your professional network: the shared contact list, longest out of touch first, narrowed by a tag (mentors,
 * recruiters, ex-colleagues — groupings are tags). Marking "in touch today" keeps the order honest; how many of your
 * applications each person is on comes from the applications list.
 */
@Component({
  selector: 'app-career-network',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Network</h1>
          <p class="text-body-secondary mb-0 small">
            The people in your working life, longest out of touch first. Anyone past
            {{ catchUpDays }} days is worth a message.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> Add someone
        </button>
      </div>

      @if (loadFailed() && !contacts()) {
        <app-load-error message="Couldn't load your network." (retry)="load()" />
      } @else if (contacts(); as contacts) {
        @if (contacts.length === 0) {
          <p class="text-body-secondary">
            Nobody yet. Start with your mentors, the recruiters you trust and the colleagues you'd
            work with again — and tag them that way.
          </p>
        } @else {
          @if (tagOptions().length > 0) {
            <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by tag">
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="tagId() === null"
                [class.btn-outline-secondary]="tagId() !== null"
                [attr.aria-pressed]="tagId() === null"
                (click)="tagId.set(null)"
              >
                Everyone
              </button>
              @for (tag of tagOptions(); track tag.id) {
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-primary]="tagId() === tag.id"
                  [class.btn-outline-secondary]="tagId() !== tag.id"
                  [attr.aria-pressed]="tagId() === tag.id"
                  (click)="tagId.set(tag.id)"
                >
                  {{ tag.name }}
                </button>
              }
            </div>
          }
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (c of listed(); track c.id) {
                <li class="list-group-item py-3">
                  <div class="d-flex flex-wrap align-items-start gap-2">
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="open(c)"
                      >
                        {{ c.name }}
                      </button>
                      @if (c.jobTitle || c.organisation) {
                        <span class="small text-body-secondary">
                          · {{ c.jobTitle }}{{ c.jobTitle && c.organisation ? ' at ' : ''
                          }}{{ c.organisation }}
                        </span>
                      }
                      <div class="small">
                        <span [class.text-body-secondary]="!c.catchUp">
                          @if (c.catchUp) {
                            <i class="bi bi-hourglass-split me-1" aria-hidden="true"></i>
                          }
                          {{ contactedText(c.lastContactedOn, today()) }}
                        </span>
                        @if (applicationCounts().get(c.id); as count) {
                          <span class="text-body-secondary">
                            · on {{ count }} {{ count === 1 ? 'application' : 'applications' }}
                          </span>
                        }
                        @for (tag of c.tags; track tag.id) {
                          <span class="badge rounded-pill text-bg-light border fw-normal ms-1">{{
                            tag.name
                          }}</span>
                        }
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      [disabled]="busyId() === c.id || c.lastContactedOn === today()"
                      (click)="contacted(c)"
                    >
                      <i class="bi bi-check2"></i> In touch today
                    </button>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class CareerNetwork {
  private readonly contactsService = inject(ContactsService);
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly catchUpDays = CATCH_UP_DAYS;
  protected readonly contactedText = contactedText;
  protected readonly today = signal(todayIso());
  protected readonly contacts = signal<Contact[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly busyId = signal<number | null>(null);
  protected readonly tagId = signal<number | null>(null);
  /** Applications per contact (recruiter or referrer). */
  protected readonly applicationCounts = signal<ReadonlyMap<number, number>>(new Map());

  protected readonly listed = computed(() => {
    const tagId = this.tagId();
    const contacts = (this.contacts() ?? []).filter(
      (c) => tagId === null || c.tags.some((t) => t.id === tagId),
    );
    return networkOrder(contacts, this.today());
  });
  protected readonly tagOptions = computed(() => {
    const tags = new Map<number, string>();
    (this.contacts() ?? []).forEach((c) => c.tags.forEach((t) => tags.set(t.id, t.name)));
    return [...tags]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.today.set(todayIso());
    this.contactsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (contacts) => {
          this.contacts.set(contacts);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
    this.careerService
      .applications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      // A side figure: if it can't load, the counts just don't show.
      .subscribe({
        next: (applications) => {
          const counts = new Map<number, number>();
          applications.forEach(
            (a) => a.contactId && counts.set(a.contactId, (counts.get(a.contactId) ?? 0) + 1),
          );
          this.applicationCounts.set(counts);
        },
        error: () => this.applicationCounts.set(new Map()),
      });
  }

  protected contacted(contact: Contact): void {
    this.busyId.set(contact.id);
    this.contactsService.contacted(contact.id, this.today()).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.contacts.update((list) =>
          (list ?? []).map((c) => (c.id === updated.id ? updated : c)),
        );
        this.toast.success(`Noted — in touch with ${updated.name} today.`);
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not update the contact.'));
      },
    });
  }

  protected async open(contact?: Contact): Promise<void> {
    const result = await openContactEditor(this.modal, contact);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Contact saved.' : 'Contact deleted.');
      this.load();
    }
  }
}
