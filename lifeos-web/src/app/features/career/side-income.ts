import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CareerService, SideIncomeSource } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import {
  SIDE_INCOME_KIND_ICONS,
  SIDE_INCOME_KIND_LABELS,
  SIDE_INCOME_STATUS_LABELS,
} from './career-view';
import { openSideIncomeEditor } from './side-income-editor';

/** Income beside the job — what's going, what's paused, what ended (the server orders them that way). */
@Component({
  selector: 'app-career-side-income',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Side income</h1>
          <p class="text-body-secondary mb-0 small">
            Freelancing, content, consulting, teaching — what you do beside the job.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add side income
        </button>
      </div>

      @if (loadFailed() && !sources()) {
        <app-load-error message="Couldn't load your side income." (retry)="load()" />
      } @else if (sources(); as sources) {
        @if (sources.length === 0) {
          <p class="text-body-secondary">Nothing yet. Add the workshop, the channel, the client.</p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (s of sources; track s.id) {
                <li class="list-group-item py-3" [class.text-body-secondary]="s.status === 'Ended'">
                  <div class="d-flex gap-2">
                    <i class="bi {{ kindIcons[s.kind] }} mt-1" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(s)"
                      >
                        {{ s.name }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[s.kind] }} · {{ statusLabels[s.status] }}
                        @if (s.startedOn) {
                          · since {{ s.startedOn | date }}
                        }
                        @if (s.endedOn) {
                          · until {{ s.endedOn | date }}
                        }
                        @if (s.url) {
                          ·
                          <a [href]="s.url" target="_blank" rel="noopener noreferrer">link</a>
                        }
                      </div>
                      @if (s.notes) {
                        <div class="small text-break" style="white-space: pre-line">
                          {{ s.notes }}
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
export class CareerSideIncome {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindIcons = SIDE_INCOME_KIND_ICONS;
  protected readonly kindLabels = SIDE_INCOME_KIND_LABELS;
  protected readonly statusLabels = SIDE_INCOME_STATUS_LABELS;
  protected readonly sources = signal<SideIncomeSource[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.careerService
      .sideIncome()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sources) => {
          this.sources.set(sources);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(source?: SideIncomeSource): Promise<void> {
    const result = await openSideIncomeEditor(this.modal, source);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Side income saved.' : 'Side income deleted.');
      this.load();
    }
  }
}
