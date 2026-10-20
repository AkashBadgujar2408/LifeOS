import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FamilyLogService, Responsibility } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { holderText } from './family-log-view';
import { openResponsibilityEditor } from './responsibility-editor';

/** Who looks after what in the family: current ones first, then the ones that have ended. */
@Component({
  selector: 'app-family-responsibilities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Responsibilities</h1>
          <p class="text-body-secondary mb-0 small">
            Commitments in the family — yours, shared, and the ones someone else carries.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> Add one
        </button>
      </div>

      @if (loadFailed() && !items()) {
        <app-load-error message="Couldn't load the responsibilities." (retry)="load()" />
      } @else if (items(); as items) {
        @if (items.length === 0) {
          <p class="text-body-secondary">
            Nothing yet. Who pays the society bill, who takes Dad to his check-ups, who keeps the
            family papers — write them down so nothing falls between people.
          </p>
        } @else {
          @for (group of groups(); track group.label) {
            @if (group.items.length > 0) {
              <h2 class="h6 text-body-secondary mt-4 mb-2">{{ group.label }}</h2>
              <div class="card">
                <ul class="list-group list-group-flush">
                  @for (r of group.items; track r.id) {
                    <li class="list-group-item py-3">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="open(r)"
                      >
                        {{ r.title }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ holderText(r) }}
                        @if (r.contactId) {
                          · for
                          <a [routerLink]="['/family/people', r.contactId]">{{ r.contactName }}</a>
                        }
                        @if (r.endedOn) {
                          · ended {{ r.endedOn | date }}
                        } @else if (r.startedOn) {
                          · since {{ r.startedOn | date }}
                        }
                      </div>
                      @if (r.taskTitle) {
                        <div class="small mt-1">
                          <i
                            class="bi"
                            [class.bi-check2-circle]="r.taskDone"
                            [class.bi-circle]="!r.taskDone"
                            aria-hidden="true"
                          ></i>
                          {{ r.taskTitle }}
                          @if (r.taskDueDate && !r.taskDone) {
                            <span class="text-body-secondary"
                              >· due {{ r.taskDueDate | date }}</span
                            >
                          }
                        </div>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FamilyResponsibilities {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly holderText = holderText;
  protected readonly items = signal<Responsibility[] | null>(null);
  protected readonly loadFailed = signal(false);

  protected readonly groups = computed(() => {
    const items = this.items() ?? [];
    const current = items.filter((r) => !r.endedOn);
    return [
      { label: 'Yours', items: current.filter((r) => r.heldBy === 'Me') },
      { label: 'Shared', items: current.filter((r) => r.heldBy === 'Shared') },
      { label: 'Someone else looks after', items: current.filter((r) => r.heldBy === 'Someone') },
      { label: 'Ended', items: items.filter((r) => r.endedOn) },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.familyLog
      .responsibilities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(responsibility?: Responsibility): Promise<void> {
    const result = await openResponsibilityEditor(this.modal, responsibility);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
      this.load();
    }
  }
}
