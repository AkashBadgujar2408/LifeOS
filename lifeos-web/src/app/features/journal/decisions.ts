import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Decision, DecisionsService } from '../../core/services/decisions.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openDecisionEditor } from './decision-editor';
import { decisionBuckets, verdictMeta } from './decision-view';

/** `/journal/decisions`: the decision journal — due for review, waiting, and how past ones turned out. */
@Component({
  selector: 'app-decisions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <a routerLink="/journal" class="small text-decoration-none d-inline-block mb-2">
        <i class="bi bi-arrow-left"></i> Journal
      </a>
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1">Decisions</h1>
          <p class="text-body-secondary mb-0 small">
            Write down why you chose, and what you expect — then look back and see how it turned
            out.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="add()">
          <i class="bi bi-plus-lg"></i> Record a decision
        </button>
      </div>

      @if (loadFailed()) {
        <app-load-error message="Couldn't load your decisions." (retry)="load()" />
      } @else if (decisions() === null) {
        <p class="text-body-secondary">Loading...</p>
      } @else if (decisions()!.length === 0) {
        <div class="card">
          <div class="card-body p-4 text-center">
            <i class="bi bi-signpost-split fs-2 text-body-secondary" aria-hidden="true"></i>
            <p class="mb-1 mt-2">No decisions recorded yet.</p>
            <p class="small text-body-secondary mb-0">
              Next time you make a call that matters, note it here with a day to look back on it.
            </p>
          </div>
        </div>
      } @else {
        <div class="row g-3">
          <div class="col-lg-6 d-flex flex-column gap-3">
            <section class="card" aria-labelledby="due-heading">
              <div class="card-body">
                <h2 id="due-heading" class="h6 mb-3">
                  Ready to look back on
                  <span class="badge rounded-pill text-bg-light">{{ buckets().due.length }}</span>
                </h2>
                @if (buckets().due.length === 0) {
                  <p class="small text-body-secondary mb-0">Nothing due for review.</p>
                }
                <div class="list-group list-group-flush">
                  @for (d of buckets().due; track d.id) {
                    <button
                      type="button"
                      class="list-group-item list-group-item-action px-0"
                      (click)="open(d)"
                    >
                      <span class="d-block fw-semibold text-break">{{ d.title }}</span>
                      <span class="d-block small text-body-secondary">
                        Decided {{ d.decidedOn | date }} · review day {{ d.reviewOn | date }}
                      </span>
                    </button>
                  }
                </div>
              </div>
            </section>

            <section class="card" aria-labelledby="waiting-heading">
              <div class="card-body">
                <h2 id="waiting-heading" class="h6 mb-3">
                  Still playing out
                  <span class="badge rounded-pill text-bg-light">{{
                    buckets().waiting.length
                  }}</span>
                </h2>
                @if (buckets().waiting.length === 0) {
                  <p class="small text-body-secondary mb-0">Nothing waiting.</p>
                }
                <div class="list-group list-group-flush">
                  @for (d of buckets().waiting; track d.id) {
                    <button
                      type="button"
                      class="list-group-item list-group-item-action px-0"
                      (click)="open(d)"
                    >
                      <span class="d-block fw-semibold text-break">{{ d.title }}</span>
                      <span class="d-block small text-body-secondary">
                        Decided {{ d.decidedOn | date }} ·
                        {{ d.reviewOn ? 'look back on ' + (d.reviewOn | date) : 'no review day' }}
                      </span>
                    </button>
                  }
                </div>
              </div>
            </section>
          </div>

          <div class="col-lg-6">
            <section class="card" aria-labelledby="reviewed-heading">
              <div class="card-body">
                <h2 id="reviewed-heading" class="h6 mb-3">
                  How they turned out
                  <span class="badge rounded-pill text-bg-light">{{
                    buckets().reviewed.length
                  }}</span>
                </h2>
                @if (buckets().reviewed.length === 0) {
                  <p class="small text-body-secondary mb-0">No outcomes recorded yet.</p>
                }
                <div class="list-group list-group-flush">
                  @for (d of buckets().reviewed; track d.id) {
                    <button
                      type="button"
                      class="list-group-item list-group-item-action px-0"
                      (click)="open(d)"
                    >
                      <span class="d-flex gap-2 align-items-start">
                        <span class="min-w-0 flex-grow-1">
                          <span class="d-block fw-semibold text-break">{{ d.title }}</span>
                          <span class="d-block small text-body-secondary text-break">
                            {{ d.actualOutcome }}
                          </span>
                        </span>
                        @if (verdictMeta(d.verdict); as verdict) {
                          <span class="small text-nowrap text-body-secondary">
                            <i class="bi {{ verdict.icon }}" aria-hidden="true"></i>
                            {{ verdict.label }}
                          </span>
                        }
                      </span>
                    </button>
                  }
                </div>
              </div>
            </section>
          </div>
        </div>
      }
    </div>
  `,
})
export class Decisions {
  private readonly decisionsService = inject(DecisionsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);

  protected readonly verdictMeta = verdictMeta;
  protected readonly decisions = signal<Decision[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly buckets = computed(() => decisionBuckets(this.decisions() ?? [], todayIso()));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.decisionsService.list().subscribe({
      next: (decisions) => this.decisions.set(decisions),
      error: (err) => {
        this.loadFailed.set(true);
        this.toast.error(apiErrorMessage(err, 'Could not load your decisions.'));
      },
    });
  }

  protected async add(): Promise<void> {
    if (await openDecisionEditor(this.modal)) {
      this.toast.success('Decision recorded.');
      this.load();
    }
  }

  protected async open(decision: Decision): Promise<void> {
    const result = await openDecisionEditor(this.modal, { decision });
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Decision saved.' : 'Decision deleted.');
      this.load();
    }
  }
}
