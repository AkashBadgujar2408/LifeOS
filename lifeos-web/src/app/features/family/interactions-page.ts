import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FamilyLogService, Interaction } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { interactionKind } from './family-log-view';
import { openInteractionEditor } from './interaction-editor';

/** Recent times in touch with anyone, newest first. */
@Component({
  selector: 'app-family-interactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Times in touch</h1>
          <p class="text-body-secondary mb-0 small">
            Calls, visits and messages — each keeps "last in touch" up to date for everyone in it.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> Log time in touch
        </button>
      </div>

      @if (loadFailed() && !interactions()) {
        <app-load-error message="Couldn't load the times in touch." (retry)="load()" />
      } @else if (interactions(); as list) {
        @if (list.length === 0) {
          <p class="text-body-secondary">
            Nothing logged yet. After a call with your parents or a dinner with friends, log it here
            — with everyone who was there.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (i of list; track i.id) {
                @let kind = kindOf(i.kind);
                <li class="list-group-item py-3 d-flex align-items-start gap-3">
                  <i class="bi {{ kind.icon }} text-body-secondary fs-5" aria-hidden="true"></i>
                  <div class="min-w-0 flex-grow-1">
                    <button
                      type="button"
                      class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                      (click)="open(i)"
                    >
                      {{ i.summary || kind.label }}
                    </button>
                    <div class="small text-body-secondary">
                      {{ i.occurredOn | date }} · {{ kind.label }} with
                      @for (p of i.people; track p.contactId; let last = $last) {
                        <a [routerLink]="['/family/people', p.contactId]">{{ p.name }}</a
                        >{{ last ? '' : ', ' }}
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          </div>
          @if (list.length === take) {
            <p class="small text-body-secondary mt-2">Showing the latest {{ take }}.</p>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FamilyInteractions {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly take = 200;
  protected readonly kindOf = interactionKind;
  protected readonly interactions = signal<Interaction[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.familyLog
      .interactions(undefined, this.take)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.interactions.set(list);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(interaction?: Interaction): Promise<void> {
    const result = await openInteractionEditor(this.modal, interaction);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
      this.load();
    }
  }
}
