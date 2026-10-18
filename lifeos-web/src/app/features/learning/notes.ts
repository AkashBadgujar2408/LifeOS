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
import { apiErrorMessage } from '../../core/services/api-error';
import { KnowledgeNote, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { isDue, reviewText } from './learning-plan-view';
import { openNoteEditor } from './note-editor';

/**
 * Notes worth keeping, and the revision planner on top: the ones due today (or missed) to go through — open one,
 * try to recall it, then say whether it came back. Everything else below, newest change first.
 */
@Component({
  selector: 'app-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  templateUrl: './notes.html',
  styles: `
    .note-excerpt {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-line;
    }
  `,
})
export class Notes {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reviewText = reviewText;
  protected readonly today = signal(todayIso());
  protected readonly notes = signal<KnowledgeNote[] | null>(null);
  protected readonly loadFailed = signal(false);
  /** Due notes whose answer is showing (recall first, then reveal). */
  protected readonly revealed = signal<ReadonlySet<number>>(new Set());
  protected readonly busyId = signal<number | null>(null);

  protected readonly due = computed(() =>
    (this.notes() ?? [])
      .filter((n) => isDue(n, this.today()))
      .sort((a, b) => (a.nextReviewOn! < b.nextReviewOn! ? -1 : 1)),
  );
  protected readonly others = computed(() =>
    (this.notes() ?? []).filter((n) => !isDue(n, this.today())),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.today.set(todayIso());
    this.learningService
      .knowledgeNotes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (notes) => {
          this.notes.set(notes);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected reveal(note: KnowledgeNote): void {
    this.revealed.update((set) => new Set([...set, note.id]));
  }

  protected review(note: KnowledgeNote, remembered: boolean): void {
    this.busyId.set(note.id);
    this.learningService.reviewKnowledgeNote(note.id, remembered, this.today()).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.notes.update((list) => (list ?? []).map((n) => (n.id === updated.id ? updated : n)));
        this.toast.success(
          remembered
            ? `Nice. ${reviewText(updated, this.today())}.`
            : "No problem — it's back tomorrow, and the gaps start again.",
        );
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not record the review.'));
      },
    });
  }

  protected async open(note?: KnowledgeNote): Promise<void> {
    const result = await openNoteEditor(this.modal, note);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Note saved.' : 'Note deleted.');
      this.load();
    }
  }
}
