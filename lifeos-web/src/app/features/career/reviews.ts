import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CareerService, PerformanceReview } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openReviewEditor } from './review-editor';

/** Performance reviews, latest first — the feedback side by side, so patterns across years show. */
@Component({
  selector: 'app-career-reviews',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Performance reviews</h1>
          <p class="text-body-secondary mb-0 small">
            What each appraisal said, in their words. Read the "to work on" lines together — the
            ones that repeat are the ones that matter.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a review
        </button>
      </div>

      @if (loadFailed() && !reviews()) {
        <app-load-error message="Couldn't load your reviews." (retry)="load()" />
      } @else if (reviews(); as reviews) {
        @if (reviews.length === 0) {
          <p class="text-body-secondary">
            No reviews yet. Add your last appraisal while you still have the email.
          </p>
        }
        <div class="d-flex flex-column gap-3">
          @for (r of reviews; track r.id) {
            <article class="card">
              <div class="card-body">
                <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div class="min-w-0">
                    <h2 class="h6 mb-1 text-break">
                      {{ r.periodLabel || (r.reviewedOn | date) }}
                      @if (r.rating) {
                        <span class="badge rounded-pill text-bg-light border fw-normal ms-1">{{
                          r.rating
                        }}</span>
                      }
                    </h2>
                    <div class="small text-body-secondary">
                      Reviewed {{ r.reviewedOn | date }}
                      @if (r.role) {
                        · {{ r.role }} at {{ r.organisation }}
                      }
                    </div>
                  </div>
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="edit(r)">
                    <i class="bi bi-pencil"></i> Edit
                  </button>
                </div>
                <div class="row g-3 mt-0 small">
                  @if (r.strengths) {
                    <div class="col-md-6">
                      <div class="text-body-secondary">What went well</div>
                      <div class="text-break" style="white-space: pre-line">{{ r.strengths }}</div>
                    </div>
                  }
                  @if (r.improvements) {
                    <div class="col-md-6">
                      <div class="text-body-secondary">To work on</div>
                      <div class="text-break" style="white-space: pre-line">
                        {{ r.improvements }}
                      </div>
                    </div>
                  }
                  @if (r.notes) {
                    <div class="col-12">
                      <div class="text-body-secondary">Your notes</div>
                      <div class="text-break" style="white-space: pre-line">{{ r.notes }}</div>
                    </div>
                  }
                </div>
              </div>
            </article>
          }
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class CareerReviews {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reviews = signal<PerformanceReview[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.careerService
      .reviews()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reviews) => {
          this.reviews.set(reviews);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(review?: PerformanceReview): Promise<void> {
    const result = await openReviewEditor(this.modal, review);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Review saved.' : 'Review deleted.');
      this.load();
    }
  }
}
