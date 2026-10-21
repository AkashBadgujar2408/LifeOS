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
import { NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  LeisureService,
  MEDIA_ITEM_ENTITY_TYPE,
  MediaItemDetail,
  MediaLog,
  MediaNote,
  MediaNoteKind,
} from '../../core/services/leisure.service';
import { ToastService } from '../../core/services/toast.service';
import { CountsToward } from '../../shared/components/counts-toward/counts-toward';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { MEDIA_KIND_INFO, hasEpisodes, progressText, statusLabel } from './leisure-view';
import { openMediaEditor } from './media-editor';

/**
 * One media item (Session 78b; Learning's book page folded in): where you are in it (a book's page or a show's
 * episode — the API starts or finishes it), the notes and highlights it left, and each time you watched, played or
 * listened to it.
 */
@Component({
  selector: 'app-media-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    CountsToward,
    EntityReminders,
    LoadError,
  ],
  templateUrl: './media-detail.html',
  styles: `
    .media-highlight {
      border-left: 3px solid var(--lifeos-teal);
      padding-left: 0.75rem;
      font-family: Sora, sans-serif;
    }
  `,
})
export class MediaDetail {
  private readonly fb = inject(FormBuilder);
  private readonly leisureService = inject(LeisureService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly entityType = MEDIA_ITEM_ENTITY_TYPE;
  protected readonly kindInfo = MEDIA_KIND_INFO;
  protected readonly statusLabel = statusLabel;
  protected readonly progressText = progressText;
  protected readonly hasEpisodes = hasEpisodes;
  protected readonly formatMinutes = formatMinutes;
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly minDate = { year: 1960, month: 1, day: 1 };

  protected readonly item = signal<MediaItemDetail | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly savingProgress = signal(false);
  protected readonly savingNote = signal(false);
  protected readonly savingLog = signal(false);
  /** The note being edited (its form replaces it in the list); null = the add form is for a new one. */
  protected readonly editingNoteId = signal<number | null>(null);
  protected readonly noteAttempted = signal(false);
  protected readonly logAttempted = signal(false);
  private readonly titled = itemTitle(() => this.item()?.title);

  protected readonly highlights = computed(
    () => this.item()?.notes.filter((n) => n.kind === 'Highlight').length ?? 0,
  );

  protected readonly pageForm = this.fb.group({
    currentPage: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(100000),
    ]),
  });

  protected readonly episodeForm = this.fb.group({
    season: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(1000)]),
    episode: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(10000),
    ]),
  });

  protected readonly noteForm = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<MediaNoteKind>('Highlight'),
    text: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(4000)]),
    page: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
  });

  protected readonly logForm = this.fb.group({
    loggedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    minutes: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(1440)]),
    note: this.fb.nonNullable.control('', Validators.maxLength(500)),
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.leisureService
      .mediaItem(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => this.show(item),
        error: () => this.loadFailed.set(true),
      });
  }

  private show(item: MediaItemDetail): void {
    this.item.set(item);
    this.loadFailed.set(false);
    this.pageForm.reset({ currentPage: item.currentPage });
    this.episodeForm.reset({ season: item.season, episode: item.episode });
  }

  protected pageError(): string | null {
    const control = this.pageForm.controls.currentPage;
    const item = this.item();
    if (!control.touched) {
      return null;
    }
    if (control.errors) {
      return 'Enter the page you are on.';
    }
    return item?.totalPages && (control.value ?? 0) > item.totalPages
      ? `This book has ${item.totalPages} pages.`
      : null;
  }

  protected episodeError(name: 'season' | 'episode'): string | null {
    const control = this.episodeForm.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return name === 'season' ? 'Seasons are 1 to 1,000.' : 'Enter the episode you are on.';
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

  protected logError(name: 'loggedOn' | 'minutes' | 'note'): string | null {
    const control = this.logForm.controls[name];
    if (!(control.touched || this.logAttempted()) || !control.errors) {
      return null;
    }
    switch (name) {
      case 'loggedOn':
        return dateFieldError(control.errors) ?? 'Pick the day.';
      case 'minutes':
        return 'Minutes are 1 to 1,440.';
      default:
        return 'Keep it under 500 characters.';
    }
  }

  protected savePage(item: MediaItemDetail): void {
    const control = this.pageForm.controls.currentPage;
    control.markAsTouched();
    if (this.pageForm.invalid || this.pageError()) {
      return;
    }
    this.saveProgress(item, { currentPage: control.value ?? 0, today: todayIso() });
  }

  protected saveEpisode(item: MediaItemDetail, step = 0): void {
    this.episodeForm.markAllAsTouched();
    if (this.episodeForm.invalid) {
      return;
    }
    const v = this.episodeForm.getRawValue();
    this.saveProgress(item, {
      season: item.kind === 'Series' ? v.season || null : null,
      episode: (v.episode ?? 0) + step,
      today: todayIso(),
    });
  }

  private saveProgress(
    item: MediaItemDetail,
    payload: Parameters<LeisureService['setProgress']>[1],
  ): void {
    const before = item.status;
    this.savingProgress.set(true);
    this.leisureService.setProgress(item.id, payload).subscribe({
      next: (saved) => {
        this.savingProgress.set(false);
        this.show(saved);
        if (saved.status === 'Finished' && before !== 'Finished') {
          this.toast.success(`Finished "${saved.title}". Give it a rating from Edit.`);
        } else if (saved.status === 'InProgress' && before !== 'InProgress') {
          this.toast.success(`${statusLabel(saved.kind, 'InProgress')}. Enjoy it.`);
        } else {
          this.toast.success('Place saved.');
        }
      },
      error: (err) => {
        this.savingProgress.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save your place.'));
      },
    });
  }

  protected editNote(note: MediaNote): void {
    this.editingNoteId.set(note.id);
    this.noteAttempted.set(false);
    this.noteForm.reset({ kind: note.kind, text: note.text, page: note.page });
  }

  protected cancelNote(): void {
    this.editingNoteId.set(null);
    this.noteAttempted.set(false);
    this.noteForm.reset({ kind: 'Highlight', text: '', page: null });
  }

  protected saveNote(item: MediaItemDetail): void {
    const text = this.noteForm.controls.text;
    text.setValue(text.value.trim());
    this.noteAttempted.set(true);
    if (this.noteForm.invalid) {
      return;
    }
    const v = this.noteForm.getRawValue();
    const page = item.kind === 'Book' ? v.page || null : null;
    if (page && item.totalPages && page > item.totalPages) {
      this.toast.error(`This book has ${item.totalPages} pages.`);
      return;
    }
    const editing = this.editingNoteId();
    this.savingNote.set(true);
    this.leisureService.saveNote(item.id, editing, { kind: v.kind, text: v.text, page }).subscribe({
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

  protected async removeNote(item: MediaItemDetail, note: MediaNote): Promise<void> {
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
    this.leisureService.removeNote(item.id, note.id).subscribe({
      next: () => {
        if (this.editingNoteId() === note.id) {
          this.cancelNote();
        }
        this.load();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the note.')),
    });
  }

  protected addLog(item: MediaItemDetail): void {
    this.logAttempted.set(true);
    if (this.logForm.invalid) {
      return;
    }
    const v = this.logForm.getRawValue();
    this.savingLog.set(true);
    this.leisureService
      .addLog(item.id, {
        loggedOn: v.loggedOn!,
        minutes: v.minutes || null,
        note: v.note.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => {
          this.savingLog.set(false);
          this.logAttempted.set(false);
          this.logForm.reset({ loggedOn: todayIso(), minutes: null, note: '' });
          this.load();
        },
        error: (err) => {
          this.savingLog.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not log it.'));
        },
      });
  }

  protected removeLog(item: MediaItemDetail, log: MediaLog): void {
    this.leisureService.removeLog(item.id, log.id).subscribe({
      next: () => this.load(),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove it.')),
    });
  }

  /** "Watched", "Played", "Read", "Listened" — the log's heading verb. */
  protected logVerb(item: MediaItemDetail): string {
    switch (item.kind) {
      case 'Book':
        return 'Read';
      case 'Game':
        return 'Played';
      case 'Album':
      case 'Podcast':
        return 'Listened';
      case 'Other':
        return 'Spent time';
      default:
        return 'Watched';
    }
  }

  protected async edit(item: MediaItemDetail): Promise<void> {
    const saved = await openMediaEditor(this.modal, item);
    if (saved) {
      this.show(saved);
      this.toast.success('Saved.');
    }
  }

  protected async remove(item: MediaItemDetail): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete "${item.title}"?`,
      text: 'Its notes, highlights and logs go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.leisureService.removeMediaItem(item.id).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        void this.router.navigate(['/leisure']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }
}
