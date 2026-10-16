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
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/services/api-error';
import { Achievement, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { progressPercent, splitAchievements } from './achievements-view';

/**
 * Achievements: earned from what you actually did, computed by the API on every visit and never stored — nothing to
 * lose, no deadlines. Each unlock also appears in your story on the day it was earned.
 */
@Component({
  selector: 'app-achievements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './achievements.html',
  styleUrl: './achievements.scss',
})
export class Achievements {
  private readonly storyService = inject(StoryService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly progressPercent = progressPercent;
  protected readonly achievements = signal<Achievement[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly split = computed(() => splitAchievements(this.achievements() ?? []));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.storyService
      .achievements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (achievements) => {
          this.achievements.set(achievements);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your achievements.'));
        },
      });
  }
}
