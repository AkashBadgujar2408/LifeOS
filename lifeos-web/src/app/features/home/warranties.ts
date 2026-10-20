import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { HomeService, Warranty } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { HOME_TARGET_LABELS, WARRANTY_KIND_LABELS, runsOutStatus } from './home-view';
import { openWarrantyEditor } from './warranty-editor';

/** Warranties and AMCs, running out soonest first; the ones that have run out (or whose item is gone) below. */
@Component({
  selector: 'app-home-warranties',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Warranties &amp; AMCs</h1>
          <p class="text-body-secondary mb-0 small">
            What's still covered, and a reminder before each cover runs out.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add warranty
        </button>
      </div>

      @if (loadFailed() && !warranties()) {
        <app-load-error message="Couldn't load your warranties." (retry)="load()" />
      } @else if (warranties()) {
        @if (current().length === 0 && past().length === 0) {
          <p class="text-body-secondary">
            No warranties yet. Add the ones on your appliances and gadgets — repairs are free only
            while you remember them.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (w of rows(); track w.id) {
                @if (w === past()[0]) {
                  <li
                    class="list-group-item small fw-semibold text-body-secondary bg-body-tertiary"
                  >
                    Ran out, or the item is gone
                  </li>
                }
                @let status = runsOut(w.expiresOn);
                <li class="list-group-item py-3">
                  <div class="d-flex flex-wrap gap-2 align-items-start">
                    <i class="bi bi-patch-check mt-1" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(w)"
                      >
                        {{ w.coverName }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[w.kind] }} · {{ targetLabels[w.coverType] }}
                        @if (w.provider) {
                          · {{ w.provider }}
                        }
                        @if (w.contactName) {
                          · call {{ w.contactName }}
                        }
                        @if (w.cost !== null && w.currency) {
                          · {{ money(w.cost, w.currency) }}
                        }
                        @if (w.coverDisposed) {
                          · item let go
                        }
                      </div>
                    </div>
                    <div class="small text-end">
                      <div
                        [class.text-danger-emphasis]="status.state === 'past' && !w.coverDisposed"
                        [class.fw-semibold]="status.state === 'soon' || status.state === 'today'"
                      >
                        {{ status.state === 'later' ? 'Until ' : '' }}{{ w.expiresOn | date }}
                      </div>
                      @if (status.state !== 'later') {
                        <div>{{ status.label }}</div>
                      }
                      @if (w.reminderDays !== null && status.state !== 'past') {
                        <div class="text-body-secondary">
                          <i class="bi bi-bell" aria-hidden="true"></i> {{ w.reminderDays }} days
                          before
                        </div>
                      }
                    </div>
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
export class HomeWarranties {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = WARRANTY_KIND_LABELS;
  protected readonly targetLabels = HOME_TARGET_LABELS;
  protected readonly money = formatMoney;
  protected readonly warranties = signal<Warranty[] | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  /** In force, running out soonest first (the API's order). */
  protected readonly current = computed(() =>
    (this.warranties() ?? []).filter((w) => w.expiresOn >= this.today && !w.coverDisposed),
  );

  /** Ran out or the item is gone, most recent first. */
  protected readonly past = computed(() =>
    (this.warranties() ?? []).filter((w) => w.expiresOn < this.today || w.coverDisposed).reverse(),
  );

  /** In force first, then the rest (the template puts a divider before the first of those). */
  protected readonly rows = computed(() => [...this.current(), ...this.past()]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.homeService
      .warranties()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (warranties) => {
          this.warranties.set(warranties);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected runsOut(day: string) {
    return runsOutStatus(day, this.today);
  }

  protected async edit(warranty?: Warranty): Promise<void> {
    const result = await openWarrantyEditor(this.modal, warranty);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
    }
  }
}
