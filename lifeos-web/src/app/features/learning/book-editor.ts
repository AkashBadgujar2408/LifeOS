import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  BOOK_STATUSES,
  Book,
  BookDetail,
  BookStatus,
  LearningService,
  Skill,
} from '../../core/services/learning.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { BOOK_STATUS_LABELS } from './learning-view';

const LEARNING_AREA_NAME = 'Learning';

/** Opens the book dialog (new when `book` is missing); resolves with the saved book, or null if dismissed. */
export async function openBookEditor(modal: NgbModal, book?: Book): Promise<BookDetail | null> {
  const modalRef = modal.open(BookEditor, { ariaLabelledBy: 'book-editor-heading', size: 'lg' });
  (modalRef.componentInstance as BookEditor).configure(book);
  try {
    return (await modalRef.result) as BookDetail;
  } catch {
    return null;
  }
}

// Mirrors CK_Books_Pages and CK_Books_Dates (the API fills in a missing start/finish day itself).
function bookRules(group: AbstractControl): ValidationErrors | null {
  const { totalPages, currentPage, startedOn, finishedOn, status } = group.value as {
    totalPages: number | null;
    currentPage: number | null;
    startedOn: string | null;
    finishedOn: string | null;
    status: BookStatus;
  };
  if (totalPages && currentPage !== null && currentPage > totalPages) {
    return { pastTheEnd: true };
  }
  if (status === 'Finished' && startedOn && finishedOn && finishedOn < startedOn) {
    return { finishedBeforeStarted: true };
  }
  return null;
}

@Component({
  selector: 'app-book-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './book-editor.html',
  styles: `
    .book-star {
      color: var(--lifeos-amber);
    }
  `,
})
export class BookEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly statuses = BOOK_STATUSES;
  protected readonly statusLabels = BOOK_STATUS_LABELS;
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly skills = signal<Skill[]>([]);

  protected readonly book = signal<Book | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      author: this.fb.nonNullable.control('', Validators.maxLength(200)),
      status: this.fb.nonNullable.control<BookStatus>('WantToRead'),
      totalPages: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
      currentPage: this.fb.control<number | null>(0, [Validators.min(0), Validators.max(100000)]),
      startedOn: this.fb.control<string | null>(null),
      finishedOn: this.fb.control<string | null>(null),
      rating: this.fb.control<number | null>(null),
      skillId: this.fb.control<number | null>(null),
      lifeAreaId: this.fb.control<number | null>(null),
    },
    { validators: bookRules },
  );

  constructor() {
    effect(() => {
      const learning = this.lifeAreas().find((a) => a.name === LEARNING_AREA_NAME);
      untracked(() => {
        const control = this.form.controls.lifeAreaId;
        if (learning && !this.book() && control.pristine && control.value === null) {
          control.setValue(learning.id);
        }
      });
    });
    this.learningService
      .skills()
      .subscribe({ next: (skills) => this.skills.set(skills), error: () => undefined });
  }

  configure(book?: Book): void {
    this.book.set(book ?? null);
    this.tagIds.set(book?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      title: book?.title ?? '',
      author: book?.author ?? '',
      status: book?.status ?? 'WantToRead',
      totalPages: book?.totalPages ?? null,
      currentPage: book?.currentPage ?? 0,
      startedOn: book?.startedOn ?? null,
      finishedOn: book?.finishedOn ?? null,
      rating: book?.rating ?? null,
      skillId: book?.skillId ?? null,
      lifeAreaId: book ? book.lifeAreaId : null,
    });
  }

  /** Ratings belong to a book you've finished or given up on. */
  protected canRate(): boolean {
    const status = this.form.controls.status.value;
    return status === 'Finished' || status === 'Abandoned';
  }

  protected setRating(stars: number): void {
    const control = this.form.controls.rating;
    control.setValue(control.value === stars ? null : stars);
    control.markAsDirty();
  }

  protected fieldError(
    name: 'title' | 'author' | 'totalPages' | 'currentPage' | 'startedOn' | 'finishedOn',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    switch (name) {
      case 'startedOn':
        return dateFieldError(control.errors);
      case 'finishedOn':
        return (
          dateFieldError(control.errors) ??
          (this.form.errors?.['finishedBeforeStarted']
            ? "It can't be finished before it was started."
            : null)
        );
      case 'totalPages':
        return control.errors ? 'Pages are 1 to 100,000.' : null;
      case 'currentPage':
        if (control.errors) {
          return 'Pages are 0 to 100,000.';
        }
        return this.form.errors?.['pastTheEnd'] ? "That's past the last page." : null;
      default:
        if (control.errors?.['required']) {
          return 'Give the book a title.';
        }
        return control.errors?.['maxlength'] ? `Keep the ${name} under 200 characters.` : null;
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.learningService
      .saveBook(this.book()?.id ?? null, {
        title: v.title,
        author: v.author.trim() || null,
        status: v.status,
        totalPages: v.totalPages || null,
        currentPage: v.status === 'WantToRead' ? 0 : (v.currentPage ?? 0),
        startedOn: v.startedOn,
        finishedOn: v.status === 'Finished' ? v.finishedOn : null,
        rating: this.canRate() ? v.rating : null,
        skillId: v.skillId,
        lifeAreaId: v.lifeAreaId,
        tagIds: this.tagIds(),
        today: todayIso(),
      })
      .subscribe({
        next: (saved) => this.activeModal.close(saved),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the book.'));
        },
      });
  }
}
