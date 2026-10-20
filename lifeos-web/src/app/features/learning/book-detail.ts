import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  BOOK_ENTITY_TYPE,
  BookDetail as BookDetailModel,
  BookNote,
  BookNoteKind,
  LearningService,
} from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { CountsToward } from '../../shared/components/counts-toward/counts-toward';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openBookEditor } from './book-editor';
import { BOOK_STATUS_LABELS, pagesText } from './learning-view';

/**
 * One book: where you are in it ("I'm on page …" starts or finishes it), and the notes and highlights it left —
 * added, edited and removed in place.
 */
@Component({
  selector: 'app-book-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    LinkedItems,
    CountsToward,
    EntityReminders,
    LoadError,
  ],
  templateUrl: './book-detail.html',
  styles: `
    .book-highlight {
      border-left: 3px solid var(--lifeos-teal);
      padding-left: 0.75rem;
      font-family: Sora, sans-serif;
    }
  `,
})
export class BookDetail {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly bookEntityType = BOOK_ENTITY_TYPE;
  protected readonly statusLabels = BOOK_STATUS_LABELS;
  protected readonly pagesText = pagesText;

  protected readonly book = signal<BookDetailModel | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly savingPage = signal(false);
  protected readonly savingNote = signal(false);
  /** The note being edited (its form replaces it in the list); null = the add form is for a new one. */
  protected readonly editingNoteId = signal<number | null>(null);
  protected readonly noteAttempted = signal(false);
  private readonly titled = itemTitle(() => this.book()?.title);

  protected readonly highlights = computed(
    () => this.book()?.notes.filter((n) => n.kind === 'Highlight').length ?? 0,
  );

  protected readonly pageForm = this.fb.group({
    currentPage: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(100000),
    ]),
  });

  protected readonly noteForm = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<BookNoteKind>('Highlight'),
    text: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(4000)]),
    page: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.learningService
      .book(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (book) => this.show(book),
        error: () => this.loadFailed.set(true),
      });
  }

  private show(book: BookDetailModel): void {
    this.book.set(book);
    this.loadFailed.set(false);
    this.pageForm.reset({ currentPage: book.currentPage });
  }

  protected pageError(): string | null {
    const control = this.pageForm.controls.currentPage;
    const book = this.book();
    if (!control.touched) {
      return null;
    }
    if (control.errors) {
      return 'Enter the page you are on.';
    }
    return book?.totalPages && (control.value ?? 0) > book.totalPages
      ? `This book has ${book.totalPages} pages.`
      : null;
  }

  protected noteError(name: 'text' | 'page'): string | null {
    const control = this.noteForm.controls[name];
    if (!(control.touched || this.noteAttempted()) || !control.errors) {
      return null;
    }
    if (name === 'page') {
      return 'Pages are 1 to 100,000.';
    }
    return control.errors['required']
      ? 'Write the note or paste the highlight.'
      : 'Keep it under 4000 characters.';
  }

  protected savePage(book: BookDetailModel): void {
    const control = this.pageForm.controls.currentPage;
    control.markAsTouched();
    if (this.pageForm.invalid || this.pageError()) {
      return;
    }
    const before = book.status;
    this.savingPage.set(true);
    this.learningService.setBookPage(book.id, control.value ?? 0, todayIso()).subscribe({
      next: (saved) => {
        this.savingPage.set(false);
        this.show(saved);
        if (saved.status === 'Finished' && before !== 'Finished') {
          this.toast.success(`Finished "${saved.title}". Give it a rating from Edit.`);
        } else if (saved.status === 'Reading' && before === 'WantToRead') {
          this.toast.success('Started reading. Enjoy it.');
        } else {
          this.toast.success('Place saved.');
        }
      },
      error: (err) => {
        this.savingPage.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save your place.'));
      },
    });
  }

  protected editNote(note: BookNote): void {
    this.editingNoteId.set(note.id);
    this.noteAttempted.set(false);
    this.noteForm.reset({ kind: note.kind, text: note.text, page: note.page });
  }

  protected cancelNote(): void {
    this.editingNoteId.set(null);
    this.noteAttempted.set(false);
    this.noteForm.reset({ kind: 'Highlight', text: '', page: null });
  }

  protected saveNote(book: BookDetailModel): void {
    const text = this.noteForm.controls.text;
    text.setValue(text.value.trim());
    this.noteAttempted.set(true);
    if (this.noteForm.invalid) {
      return;
    }
    const v = this.noteForm.getRawValue();
    if (v.page && book.totalPages && v.page > book.totalPages) {
      this.toast.error(`This book has ${book.totalPages} pages.`);
      return;
    }
    const editing = this.editingNoteId();
    this.savingNote.set(true);
    this.learningService
      .saveBookNote(book.id, editing, { kind: v.kind, text: v.text, page: v.page || null })
      .subscribe({
        next: () => {
          this.savingNote.set(false);
          this.cancelNote();
          this.load();
        },
        error: (err) => {
          this.savingNote.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the note.'));
        },
      });
  }

  protected async removeNote(book: BookDetailModel, note: BookNote): Promise<void> {
    const confirmed = await Swal.fire({
      title: note.kind === 'Highlight' ? 'Delete this highlight?' : 'Delete this note?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeBookNote(book.id, note.id).subscribe({
      next: () => {
        if (this.editingNoteId() === note.id) {
          this.cancelNote();
        }
        this.load();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the note.')),
    });
  }

  protected async edit(book: BookDetailModel): Promise<void> {
    const saved = await openBookEditor(this.modal, book);
    if (saved) {
      this.show(saved);
      this.toast.success('Book saved.');
    }
  }

  protected async remove(book: BookDetailModel): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete "${book.title}"?`,
      text: 'Its notes and highlights go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeBook(book.id).subscribe({
      next: () => {
        this.toast.success('Book deleted.');
        void this.router.navigate(['/learning/books']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the book.')),
    });
  }
}
