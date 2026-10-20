import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FamilyLogService, GiftIdea } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { giftStatus } from './family-log-view';
import { openGiftEditor } from './gift-editor';

/** A person's gifts — ideas first, then bought, then given — for their page. */
@Component({
  selector: 'app-person-gifts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, LoadError],
  template: `
    <section class="card" aria-labelledby="person-gifts-heading">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 id="person-gifts-heading" class="h6 mb-0">Gifts</h2>
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="open()">
            <i class="bi bi-plus-lg"></i> Gift idea
          </button>
        </div>
        @if (loadFailed()) {
          <app-load-error message="Couldn't load the gifts." (retry)="load()" />
        } @else if (gifts(); as list) {
          @if (list.length === 0) {
            <p class="small text-body-secondary mb-0">
              No gift ideas yet. Jot one down when it comes to you — it'll be here when the day
              does.
            </p>
          } @else {
            <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
              @for (g of list; track g.id) {
                @let status = statusOf(g.status);
                <li class="d-flex align-items-start gap-2">
                  <i class="bi {{ status.icon }} text-body-secondary mt-1" aria-hidden="true"></i>
                  <div class="min-w-0 flex-grow-1">
                    <button
                      type="button"
                      class="btn btn-link p-0 text-start text-break link-body-emphasis text-decoration-none"
                      (click)="open(g)"
                    >
                      {{ g.title }}
                    </button>
                    <div class="small text-body-secondary">
                      {{ status.label }}
                      @if (g.givenOn) {
                        {{ g.givenOn | date }}
                      }
                      @if (g.occasionTitle) {
                        · {{ g.occasionTitle }}
                      }
                      @if (g.estimatedAmount !== null && g.status === 'Idea') {
                        · about {{ g.estimatedAmount | number: '1.0-2' }} {{ g.currency }}
                      }
                      @if (g.purchaseId) {
                        ·
                        <a [routerLink]="['/purchases']" [queryParams]="{ open: g.purchaseId }">{{
                          g.purchaseTitle
                        }}</a>
                      }
                    </div>
                  </div>
                  @if (g.link) {
                    <a
                      class="btn btn-sm btn-link p-0"
                      [href]="g.link"
                      target="_blank"
                      rel="noopener noreferrer"
                      [attr.aria-label]="'Open the link for ' + g.title"
                    >
                      <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                  }
                </li>
              }
            </ul>
          }
        } @else {
          <p class="small text-body-secondary mb-0">Loading...</p>
        }
      </div>
    </section>
  `,
})
export class PersonGifts {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly contactId = input.required<number>();
  readonly contactName = input('them');

  protected readonly statusOf = giftStatus;
  protected readonly gifts = signal<GiftIdea[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    effect(() => {
      this.contactId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.familyLog
      .gifts(this.contactId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.gifts.set(list);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(gift?: GiftIdea): Promise<void> {
    const result = await openGiftEditor(this.modal, this.contactId(), this.contactName(), gift);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Gift saved.' : 'Gift deleted.');
      this.load();
    }
  }
}
