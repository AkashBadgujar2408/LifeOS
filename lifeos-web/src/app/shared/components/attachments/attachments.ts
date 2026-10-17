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
import Swal from 'sweetalert2';
import {
  ACCEPTED_FILES,
  fileIcon,
  formatBytes,
  openBlob,
  previewKind,
  saveBlob,
} from '../../../core/files/files';
import { apiErrorMessage } from '../../../core/services/api-error';
import { Attachment, AttachmentsService } from '../../../core/services/attachments.service';
import { ToastService } from '../../../core/services/toast.service';

/** Image types a browser can show (HEIC is stored but listed as a file). */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.heic';

/**
 * Files on any item that takes them (goals, tasks, journal days): list, upload (click or drop), open, download,
 * remove. <app-attachments entityType="Goal" [entityId]="goal.id" />. With [photos]="true" pictures show as
 * thumbnails (journal memories); [readonly]="true" just shows them (the Life Story).
 */
@Component({
  selector: 'app-attachments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './attachments.html',
})
export class Attachments {
  private readonly attachmentsService = inject(AttachmentsService);
  private readonly toast = inject(ToastService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<number>();
  /** Show pictures as thumbnails, and offer photos first when choosing files. */
  readonly photos = input(false);
  /** No upload or remove — only what's there (nothing at all when there's nothing). */
  readonly readonly = input(false);
  /** The heading ("Files" by default; "Memories" on a journal day). */
  readonly label = input('Files');

  private readonly destroyRef = inject(DestroyRef);
  protected readonly accepted = computed(() => (this.photos() ? PHOTO_ACCEPT : ACCEPTED_FILES));
  /** Object URLs of the picture thumbnails by attachment id; revoked when the list changes or the component goes. */
  protected readonly thumbnails = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly pictures = computed(() =>
    this.photos() ? this.attachments().filter((a) => PHOTO_TYPES.has(a.contentType)) : [],
  );
  protected readonly others = computed(() =>
    this.photos()
      ? this.attachments().filter((a) => !PHOTO_TYPES.has(a.contentType))
      : this.attachments(),
  );
  protected readonly formatBytes = formatBytes;
  protected readonly fileIcon = fileIcon;

  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly uploading = signal(false);
  protected readonly dragging = signal(false);
  protected readonly opening = signal<number | null>(null);

  constructor() {
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      untracked(() => this.load(type, id));
    });
    // Thumbnails follow the list: new pictures fetched, removed ones let go.
    effect(() => {
      const pictures = this.pictures();
      untracked(() => this.syncThumbnails(pictures));
    });
    this.destroyRef.onDestroy(() => this.thumbnails().forEach((url) => URL.revokeObjectURL(url)));
  }

  private syncThumbnails(pictures: readonly Attachment[]): void {
    const wanted = new Set(pictures.map((p) => p.id));
    const kept = new Map<number, string>();
    this.thumbnails().forEach((url, id) => {
      if (wanted.has(id)) {
        kept.set(id, url);
      } else {
        URL.revokeObjectURL(url);
      }
    });
    this.thumbnails.set(kept);
    for (const picture of pictures.filter((p) => !kept.has(p.id))) {
      this.attachmentsService.fileBlob(picture).subscribe({
        next: (blob) => {
          if (!this.pictures().some((p) => p.id === picture.id)) {
            return;
          }
          this.thumbnails.update((map) => new Map(map).set(picture.id, URL.createObjectURL(blob)));
        },
        // A picture that won't load shows as its name instead.
        error: () => undefined,
      });
    }
  }

  protected reload(): void {
    this.load(this.entityType(), this.entityId());
  }

  private load(entityType: string, entityId: number): void {
    this.loading.set(true);
    this.attachmentsService.list(entityType, entityId).subscribe({
      next: (attachments) => {
        this.attachments.set(attachments);
        this.loadFailed.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** PDFs, photos and text open in a new tab; anything else is saved. */
  protected open(attachment: Attachment): void {
    this.opening.set(attachment.id);
    this.attachmentsService.fileBlob(attachment).subscribe({
      next: (blob) => {
        this.opening.set(null);
        if (previewKind(attachment)) {
          openBlob(blob);
        } else {
          saveBlob(blob, attachment.originalName);
        }
      },
      error: (err) => {
        this.opening.set(null);
        this.toast.error(apiErrorMessage(err, `Could not open "${attachment.originalName}".`));
      },
    });
  }

  protected download(attachment: Attachment): void {
    this.attachmentsService.fileBlob(attachment).subscribe({
      next: (blob) => saveBlob(blob, attachment.originalName),
      error: (err) =>
        this.toast.error(apiErrorMessage(err, `Could not download "${attachment.originalName}".`)),
    });
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node | null)) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.upload([...(event.dataTransfer?.files ?? [])]);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.upload([...(input.files ?? [])]);
    input.value = '';
  }

  private upload(files: File[]): void {
    if (files.length === 0 || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.attachmentsService.upload(this.entityType(), this.entityId(), files).subscribe({
      next: (attachments) => {
        this.uploading.set(false);
        this.attachments.set(attachments);
        this.toast.success(
          files.length === 1
            ? this.photos()
              ? 'Photo added.'
              : 'File attached.'
            : `${files.length} ${this.photos() ? 'photos added' : 'files attached'}.`,
        );
      },
      error: (err) => {
        this.uploading.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not attach the files.'));
      },
    });
  }

  protected async remove(attachment: Attachment): Promise<void> {
    const answer = await Swal.fire({
      title: `Remove "${attachment.originalName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove file',
      confirmButtonColor: '#dc3545',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.attachmentsService.remove(attachment.id).subscribe({
      next: () => {
        this.attachments.update((list) => list.filter((a) => a.id !== attachment.id));
        this.toast.success('File removed.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the file.')),
    });
  }
}
