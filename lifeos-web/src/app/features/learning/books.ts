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
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { BOOK_STATUSES, Book, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openBookEditor } from './book-editor';
import { BOOK_STATUS_LABELS, groupByStatus, pagesText } from './learning-view';

/** The reading list: reading now, want to read, finished (newest first) and set aside. */
@Component({
  selector: 'app-books',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './books.html',
})
export class Books {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = BOOK_STATUS_LABELS;
  protected readonly pagesText = pagesText;
  protected readonly books = signal<Book[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly groups = computed(() => groupByStatus(this.books() ?? [], BOOK_STATUSES));
  protected readonly finishedThisYear = computed(() => {
    const year = todayIso().slice(0, 4);
    return (this.books() ?? []).filter((b) => b.finishedOn?.startsWith(year)).length;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.learningService
      .books()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (books) => {
          this.books.set(books);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async add(): Promise<void> {
    const saved = await openBookEditor(this.modal);
    if (saved) {
      this.toast.success('Book added.');
      void this.router.navigate(['/learning/books', saved.id]);
    }
  }

  protected stars(rating: number): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }
}
