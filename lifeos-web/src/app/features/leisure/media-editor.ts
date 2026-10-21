import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { Observable } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  LeisureService,
  MEDIA_KINDS,
  MEDIA_STATUSES,
  MediaItem,
  MediaItemDetail,
  MediaItemPayload,
  MediaKind,
  MediaStatus,
} from '../../core/services/leisure.service';
import { LearningService, Skill } from '../../core/services/learning.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { MEDIA_KIND_INFO, creatorLabel, hasEpisodes, statusLabel } from './leisure-view';

/** What a new item starts with: a kind (the backlog's filter), a title (an inbox idea's text), the inbox item it processes. */
export interface MediaEditorStart {
  kind?: MediaKind;
  title?: string;
  inboxItemId?: number;
}

/** Opens the media dialog (new when `item` is missing); resolves with the saved item, or null if dismissed. */
export async function openMediaEditor(
  modal: NgbModal,
  item?: MediaItem,
  start?: MediaEditorStart,
): Promise<MediaItemDetail | null> {
  const modalRef = modal.open(MediaEditor, { ariaLabelledBy: 'media-editor-heading', size: 'lg' });
  (modalRef.componentInstance as MediaEditor).configure(item, start);
  try {
    return (await modalRef.result) as MediaItemDetail;
  } catch {
    return null;
  }
}

// Mirrors CK_MediaItems_Pages and CK_MediaItems_Dates (the API fills in a missing start/finish day itself).
function mediaRules(group: AbstractControl): ValidationErrors | null {
  const { kind, totalPages, currentPage, startedOn, finishedOn, status } = group.value as {
    kind: MediaKind;
    totalPages: number | null;
    currentPage: number | null;
    startedOn: string | null;
    finishedOn: string | null;
    status: MediaStatus;
  };
  if (kind === 'Book' && totalPages && currentPage !== null && currentPage > totalPages) {
    return { pastTheEnd: true };
  }
  if (status === 'Finished' && startedOn && finishedOn && finishedOn < startedOn) {
    return { finishedBeforeStarted: true };
  }
  return null;
}

@Component({
  selector: 'app-media-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    NgOptionComponent,
    NgSelectComponent,
  ],
  templateUrl: './media-editor.html',
  styles: `
    .media-star {
      color: var(--lifeos-amber);
    }
  `,
})
export class MediaEditor {
  private readonly fb = inject(FormBuilder);
  private readonly leisureService = inject(LeisureService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = MEDIA_KINDS;
  protected readonly kindInfo = MEDIA_KIND_INFO;
  protected readonly statuses = MEDIA_STATUSES;
  protected readonly statusLabel = statusLabel;
  protected readonly creatorLabel = creatorLabel;
  protected readonly hasEpisodes = hasEpisodes;
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly skills = signal<Skill[]>([]);

  protected readonly item = signal<MediaItem | null>(null);
  private inboxItemId: number | null = null;
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      kind: this.fb.nonNullable.control<MediaKind>('Film'),
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      creator: this.fb.nonNullable.control('', Validators.maxLength(200)),
      whereToFind: this.fb.nonNullable.control('', Validators.maxLength(200)),
      status: this.fb.nonNullable.control<MediaStatus>('Want'),
      upNext: this.fb.nonNullable.control(false),
      totalPages: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
      currentPage: this.fb.control<number | null>(0, [Validators.min(0), Validators.max(100000)]),
      season: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(1000)]),
      episode: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10000)]),
      startedOn: this.fb.control<string | null>(null),
      finishedOn: this.fb.control<string | null>(null),
      rating: this.fb.control<number | null>(null),
      review: this.fb.nonNullable.control('', Validators.maxLength(2000)),
      skillId: this.fb.control<number | null>(null),
      lifeAreaId: this.fb.control<number | null>(null),
    },
    { validators: mediaRules },
  );

  constructor() {
    // Skills are optional (a book read for one); a failed load just leaves the picker empty.
    inject(LearningService)
      .skills()
      .subscribe({ next: (skills) => this.skills.set(skills), error: () => undefined });
  }

  configure(item?: MediaItem, start?: MediaEditorStart): void {
    this.item.set(item ?? null);
    this.inboxItemId = start?.inboxItemId ?? null;
    this.tagIds.set(item?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      kind: item?.kind ?? start?.kind ?? 'Film',
      title: item?.title ?? start?.title ?? '',
      creator: item?.creator ?? '',
      whereToFind: item?.whereToFind ?? '',
      status: item?.status ?? 'Want',
      upNext: item?.upNext ?? false,
      totalPages: item?.totalPages ?? null,
      currentPage: item?.currentPage ?? 0,
      season: item?.season ?? null,
      episode: item?.episode ?? null,
      startedOn: item?.startedOn ?? null,
      finishedOn: item?.finishedOn ?? null,
      rating: item?.rating ?? null,
      review: item?.review ?? '',
      skillId: item?.skillId ?? null,
      lifeAreaId: item?.lifeAreaId ?? null,
    });
  }

  protected kind(): MediaKind {
    return this.form.controls.kind.value;
  }

  /** Ratings and reviews belong to something finished or dropped. */
  protected canRate(): boolean {
    const status = this.form.controls.status.value;
    return status === 'Finished' || status === 'Dropped';
  }

  protected setRating(stars: number): void {
    const control = this.form.controls.rating;
    control.setValue(control.value === stars ? null : stars);
    control.markAsDirty();
  }

  protected fieldError(
    name:
      | 'title'
      | 'creator'
      | 'whereToFind'
      | 'totalPages'
      | 'currentPage'
      | 'season'
      | 'episode'
      | 'startedOn'
      | 'finishedOn'
      | 'review',
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
      case 'season':
        return control.errors ? 'Seasons are 1 to 1,000.' : null;
      case 'episode':
        return control.errors ? 'Episodes are 0 to 10,000.' : null;
      case 'review':
        return control.errors ? 'Keep the review under 2000 characters.' : null;
      case 'title':
        if (control.errors?.['required']) {
          return 'Give it a title.';
        }
        return control.errors?.['maxlength'] ? 'Keep the title under 200 characters.' : null;
      default:
        return control.errors?.['maxlength'] ? 'Keep it under 200 characters.' : null;
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
    const book = v.kind === 'Book';
    const shows = hasEpisodes(v.kind);
    const payload: MediaItemPayload = {
      kind: v.kind,
      title: v.title,
      creator: v.creator.trim() || null,
      whereToFind: v.whereToFind.trim() || null,
      status: v.status,
      upNext: v.status === 'Want' && v.upNext,
      totalPages: book ? v.totalPages || null : null,
      currentPage: book && v.status !== 'Want' ? (v.currentPage ?? 0) : 0,
      season: shows && v.kind === 'Series' ? v.season || null : null,
      episode: shows ? v.episode : null,
      startedOn: v.status === 'Want' ? null : v.startedOn,
      finishedOn: v.status === 'Finished' ? v.finishedOn : null,
      rating: this.canRate() ? v.rating : null,
      review: this.canRate() ? v.review.trim() || null : null,
      skillId: v.skillId,
      lifeAreaId: v.lifeAreaId,
      tagIds: this.tagIds(),
      today: todayIso(),
    };
    const id = this.item()?.id ?? null;
    const request: Observable<MediaItemDetail> =
      this.inboxItemId !== null
        ? this.leisureService.createFromInbox(this.inboxItemId, payload)
        : this.leisureService.saveMediaItem(id, payload);
    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save it.'));
      },
    });
  }
}
