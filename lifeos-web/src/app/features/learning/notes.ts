import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { KnowledgeNote, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { filterNotes, isDue, reviewText } from './learning-plan-view';
import { openNoteEditor } from './note-editor';

/**
 * The knowledge base, with the revision planner on top: the notes due today (or missed) to go through — open one,
 * try to recall it, then say whether it came back. Everything else below, newest change first, narrowed by words,
 * a tag or a skill (filterNotes, client-side — the list is already here).
 */
@Component({
  selector: 'app-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, LoadError, NgOptionComponent, NgSelectComponent],
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

  /** The knowledge-base filter (words, a tag, a skill). */
  protected readonly query = signal('');
  protected readonly tagId = signal<number | null>(null);
  protected readonly skillId = signal<number | null>(null);
  protected readonly filtering = computed(
    () => this.query().trim() !== '' || this.tagId() !== null || this.skillId() !== null,
  );
  /** All notes while nothing is chosen (due ones are above); every match, due or not, while filtering. */
  protected readonly listed = computed(() =>
    this.filtering()
      ? filterNotes(this.notes() ?? [], {
          text: this.query(),
          tagId: this.tagId(),
          skillId: this.skillId(),
        })
      : this.others(),
  );
  /** Only the tags and skills some note actually has, by name. */
  protected readonly tagOptions = computed(() => {
    const tags = new Map<number, string>();
    (this.notes() ?? []).forEach((n) => n.tags.forEach((t) => tags.set(t.id, t.name)));
    return [...tags]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly skillOptions = computed(() => {
    const skills = new Map<number, string>();
    (this.notes() ?? []).forEach((n) => n.skillId && skills.set(n.skillId, n.skillName ?? ''));
    return [...skills]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected clearFilter(): void {
    this.query.set('');
    this.tagId.set(null);
    this.skillId.set(null);
  }

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
