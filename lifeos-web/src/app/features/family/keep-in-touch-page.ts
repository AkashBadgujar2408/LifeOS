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
import { FamilyLogService, KeepInTouch } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { cadenceText, dueText, keepInTouchOrder } from './family-log-view';
import { openInteractionEditor } from './interaction-editor';

/**
 * Everyone you'd like to keep in touch with, the longest past due first. "Log it" records a time in touch with them,
 * which moves their next one along. A cadence is set or changed on the person's page.
 */
@Component({
  selector: 'app-family-keep-in-touch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <h1 class="h3 mb-1">Keep in touch</h1>
        <p class="text-body-secondary mb-0 small">
          The people you'd like to hear from more often. Set how often on someone's page.
        </p>
      </div>

      @if (loadFailed() && !items()) {
        <app-load-error message="Couldn't load who to keep in touch with." (retry)="load()" />
      } @else if (items(); as items) {
        @if (items.length === 0) {
          <p class="text-body-secondary">
            Nobody yet. Open someone in <a routerLink="/family/people">People</a> and choose how
            often you'd like to be in touch — My Day will gently remind you.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (k of ordered(); track k.contactId) {
                <li class="list-group-item py-3 d-flex flex-wrap align-items-center gap-2">
                  <div class="min-w-0 flex-grow-1">
                    <a
                      class="fw-semibold link-body-emphasis text-decoration-none"
                      [routerLink]="['/family/people', k.contactId]"
                      >{{ k.name }}</a
                    >
                    <div class="small text-body-secondary">
                      {{ cadenceText(k.cadenceDays) }} ·
                      @if (k.lastContactedOn) {
                        last {{ k.lastContactedOn | date }}
                      } @else {
                        nothing logged yet
                      }
                    </div>
                  </div>
                  <span
                    class="badge rounded-pill border fw-normal"
                    [class.text-bg-light]="k.daysUntil >= 0"
                    [class.bg-warning-subtle]="k.daysUntil < 0"
                    [class.text-warning-emphasis]="k.daysUntil < 0"
                  >
                    @if (k.daysUntil < 0) {
                      <i class="bi bi-hourglass-split me-1" aria-hidden="true"></i>
                    }
                    {{ dueText(k.daysUntil) }}
                  </span>
                  <button type="button" class="btn btn-sm btn-outline-primary" (click)="log(k)">
                    <i class="bi bi-check2"></i> Log it
                  </button>
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
export class FamilyKeepInTouch {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly cadenceText = cadenceText;
  protected readonly dueText = dueText;
  protected readonly items = signal<KeepInTouch[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly ordered = computed(() => keepInTouchOrder(this.items() ?? []));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.familyLog
      .keepInTouchList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async log(k: KeepInTouch): Promise<void> {
    const result = await openInteractionEditor(this.modal, undefined, [k.contactId]);
    if (result) {
      this.toast.success(`Noted — in touch with ${k.name}.`);
      this.load();
    }
  }
}
