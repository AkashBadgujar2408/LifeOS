import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { LearningService, ROADMAP_STATUSES, Roadmap } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { groupByStatus } from './learning-view';
import { ROADMAP_STATUS_LABELS } from './learning-plan-view';
import { openRoadmapEditor } from './roadmap-editor';

/** Learning roadmaps: the ones under way first, each with its progress and the next step. */
@Component({
  selector: 'app-roadmaps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Roadmaps</h1>
          <p class="text-body-secondary mb-0 small">
            A path in steps: courses, books, goals, or anything you name. Tick a step and the path
            moves on.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="add()">
          <i class="bi bi-plus-lg"></i> New roadmap
        </button>
      </div>

      @if (loadFailed() && !roadmaps()) {
        <app-load-error message="Couldn't load your roadmaps." (retry)="load()" />
      } @else if (roadmaps(); as roadmaps) {
        @if (roadmaps.length === 0) {
          <section class="card">
            <div class="card-body p-4">
              <h2 class="h5">No roadmaps yet</h2>
              <p class="text-body-secondary">
                Pick something you want to be able to do, and lay out the steps to get there — the
                course to take, the book to read, the goal it serves.
              </p>
              <button type="button" class="btn btn-outline-primary" (click)="add()">
                <i class="bi bi-plus-lg"></i> Start a roadmap
              </button>
            </div>
          </section>
        }
        @for (group of groups(); track group.status) {
          <section class="mb-4" [attr.aria-labelledby]="'roadmaps-' + group.status">
            <h2
              [id]="'roadmaps-' + group.status"
              class="h6 text-uppercase text-body-secondary small mb-2"
            >
              {{ statusLabels[group.status] }} · {{ group.items.length }}
            </h2>
            <div class="row row-cols-1 row-cols-md-2 g-3">
              @for (roadmap of group.items; track roadmap.id) {
                <div class="col">
                  <div class="card h-100">
                    <div class="card-body d-flex flex-column gap-1">
                      <a
                        [routerLink]="['/learning/roadmaps', roadmap.id]"
                        class="stretched-link link-body-emphasis text-decoration-none fw-semibold text-break"
                      >
                        {{ roadmap.title }}
                      </a>
                      @if (roadmap.goalTitle) {
                        <div class="small text-body-secondary text-break">
                          <i class="bi bi-flag" aria-hidden="true"></i> {{ roadmap.goalTitle }}
                        </div>
                      }
                      <div
                        class="progress mt-2"
                        style="height: 0.4rem"
                        role="progressbar"
                        [attr.aria-label]="roadmap.title + ' progress'"
                        [attr.aria-valuenow]="roadmap.progressPercent"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <div class="progress-bar" [style.width.%]="roadmap.progressPercent"></div>
                      </div>
                      <div class="d-flex justify-content-between small text-body-secondary mt-1">
                        <span>
                          {{ roadmap.completedStepCount }} of {{ roadmap.stepCount }} steps
                        </span>
                        <span class="fw-semibold">{{ roadmap.progressPercent }}%</span>
                      </div>
                      @if (roadmap.nextStepTitle && roadmap.status === 'Active') {
                        <div class="small text-break">Next: {{ roadmap.nextStepTitle }}</div>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>
        }
      } @else {
        <p class="text-body-secondary">Loading roadmaps...</p>
      }
    </div>
  `,
})
export class Roadmaps {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = ROADMAP_STATUS_LABELS;
  protected readonly roadmaps = signal<Roadmap[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() =>
    groupByStatus(this.roadmaps() ?? [], ROADMAP_STATUSES),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.learningService
      .roadmaps()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roadmaps) => {
          this.roadmaps.set(roadmaps);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async add(): Promise<void> {
    const saved = await openRoadmapEditor(this.modal);
    if (saved) {
      this.toast.success('Roadmap started. Add its first step.');
      void this.router.navigate(['/learning/roadmaps', saved.id]);
    }
  }
}
