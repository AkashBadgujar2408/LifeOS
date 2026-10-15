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
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Chapter, LifeStory, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openChapterEditor } from './chapter-editor';
import { beatLink, beatText, chapterLength, gapHeading } from './story-view';

/**
 * Your life as a book: chapters you name, filled with what actually happened (goals set and passed, objectives,
 * habits begun, the best and hardest days) — assembled by the API from the other modules, oldest first.
 */
@Component({
  selector: 'app-story',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './story.html',
  styleUrl: './story.scss',
})
export class Story {
  private readonly storyService = inject(StoryService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly today = todayIso();
  protected readonly beatText = beatText;
  protected readonly beatLink = beatLink;
  protected readonly chapterLength = chapterLength;
  protected readonly gapHeading = gapHeading;

  protected readonly story = signal<LifeStory | null>(null);
  protected readonly loadFailed = signal(false);

  /** Chapter numbers in book order (gaps aren't numbered). */
  protected readonly chapterNumbers = computed(() => {
    const numbers = new Map<number, number>();
    let n = 0;
    for (const section of this.story()?.sections ?? []) {
      if (section.chapter) {
        numbers.set(section.chapter.id, ++n);
      }
    }
    return numbers;
  });

  protected readonly current = computed(
    () => this.story()?.sections.find((s) => s.chapter?.isCurrent)?.chapter ?? null,
  );

  protected readonly isEmpty = computed(() => {
    const story = this.story();
    return !!story && story.sections.every((s) => !s.chapter && s.beats.length === 0);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.storyService
      .lifeStory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (story) => {
          this.story.set(story);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your story.'));
        },
      });
  }

  protected async editChapter(chapter?: Chapter): Promise<void> {
    const result = await openChapterEditor(this.modal, chapter);
    if (!result) {
      return;
    }
    if (result.kind === 'deleted') {
      this.toast.success('Chapter deleted. What happened in it is still in your story.');
    } else if (result.result.closedChapter) {
      this.toast.success(
        `New chapter begun. "${result.result.closedChapter.title}" is closed the day before.`,
      );
    } else {
      this.toast.success('Chapter saved.');
    }
    this.load();
  }

  protected jumpToNow(): void {
    // No explicit behavior: the global CSS scroll-behavior (smooth unless the user prefers reduced motion) applies.
    document.getElementById('chapter-now')?.scrollIntoView({ block: 'start' });
  }
}
