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
import { CareerAchievement, CareerService } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openAchievementEditor } from './achievement-editor';
import { ACHIEVEMENT_KIND_ICONS, ACHIEVEMENT_KIND_LABELS } from './career-view';

/** Professional achievements by year, newest first — the raw material for a resume and for your story. */
@Component({
  selector: 'app-career-achievements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Achievements</h1>
          <p class="text-body-secondary mb-0 small">
            Projects shipped, promotions, awards, contributions. Each one is a moment in your story.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add achievement
        </button>
      </div>

      @if (loadFailed() && !achievements()) {
        <app-load-error message="Couldn't load your achievements." (retry)="load()" />
      } @else if (achievements(); as achievements) {
        @if (achievements.length === 0) {
          <p class="text-body-secondary">
            Nothing yet. Write down the next thing you're proud of while you still remember the
            numbers.
          </p>
        }
        @for (year of byYear(); track year.year) {
          <h2 class="h6 text-body-secondary mt-3 mb-2">{{ year.year }}</h2>
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (a of year.items; track a.id) {
                <li class="list-group-item py-3">
                  <div class="d-flex gap-2">
                    <i
                      class="bi {{ kindIcons[a.kind] }} text-body-secondary mt-1"
                      aria-hidden="true"
                    ></i>
                    <div class="min-w-0">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(a)"
                      >
                        {{ a.title }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ kindLabels[a.kind] }} · {{ a.achievedOn | date }}
                        @if (a.role) {
                          · {{ a.role }} at {{ a.organisation }}
                        }
                      </div>
                      @if (a.description) {
                        <div class="small text-break" style="white-space: pre-line">
                          {{ a.description }}
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
export class CareerAchievements {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindIcons = ACHIEVEMENT_KIND_ICONS;
  protected readonly kindLabels = ACHIEVEMENT_KIND_LABELS;
  protected readonly achievements = signal<CareerAchievement[] | null>(null);
  protected readonly loadFailed = signal(false);

  /** Grouped by the year they happened (they arrive newest first). */
  protected readonly byYear = computed(() => {
    const groups: { year: string; items: CareerAchievement[] }[] = [];
    for (const a of this.achievements() ?? []) {
      const year = a.achievedOn.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last?.year === year) {
        last.items.push(a);
      } else {
        groups.push({ year, items: [a] });
      }
    }
    return groups;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.careerService
      .achievements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (achievements) => {
          this.achievements.set(achievements);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(achievement?: CareerAchievement): Promise<void> {
    const result = await openAchievementEditor(this.modal, achievement);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Achievement saved.' : 'Achievement deleted.');
      this.load();
    }
  }
}
