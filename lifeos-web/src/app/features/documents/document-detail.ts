import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';
import {
  DOCUMENT_ENTITY_TYPE,
  DocumentFile,
  DocumentsService,
  LifeDocument,
} from '../../core/services/documents.service';
import { ToastService } from '../../core/services/toast.service';
import { VaultService } from '../../core/services/vault.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { ensureVaultUnlocked } from '../../shared/components/vault-unlock/vault-unlock';
import { openDocumentEditor } from './document-editor';
import { saveBlob } from '../../core/files/files';
import {
  ACCEPTED_FILES,
  EXPIRY_REMINDER_OPTIONS,
  KIND_META,
  PreviewKind,
  expiryStatus,
  formatBytes,
  previewKind,
} from './document-view';

interface Preview {
  fileId: number;
  kind: Exclude<PreviewKind, null>;
  /** Object URL of the fetched bytes (image, PDF); revoked when the preview changes. */
  url: string | null;
  /** Same URL, trusted for the PDF <iframe> (it's our own blob: URL, never a remote one). */
  frameUrl: SafeResourceUrl | null;
  text: string | null;
}

@Component({
  selector: 'app-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LinkedItems, EntityReminders, LoadError],
  templateUrl: './document-detail.html',
  styleUrl: './document-detail.scss',
})
export class DocumentDetail implements OnInit {
  private readonly documentsService = inject(DocumentsService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly vault = inject(VaultService);

  readonly id = input.required<string>();

  protected readonly entityType = DOCUMENT_ENTITY_TYPE;
  protected readonly kindMeta = KIND_META;
  protected readonly accepted = ACCEPTED_FILES;
  protected readonly formatBytes = formatBytes;
  protected readonly previewKind = previewKind;
  protected readonly today = todayIso();

  protected readonly document = signal<LifeDocument | null>(null);
  private readonly titled = itemTitle(() => this.document()?.title);
  protected readonly loadFailed = signal(false);
  protected readonly uploading = signal(false);
  protected readonly dragging = signal(false);
  protected readonly preview = signal<Preview | null>(null);
  protected readonly previewLoading = signal<number | null>(null);
  /** When the vault locks again (ms), or null while it's locked. */
  protected readonly vaultUntil = this.vault.unlockedUntil;

  protected readonly expiry = computed(() =>
    expiryStatus(this.document()?.expiresOn ?? null, this.today),
  );
  protected readonly reminderLabel = computed(() => {
    const days = this.document()?.expiryReminderDays;
    return days === null || days === undefined
      ? null
      : (EXPIRY_REMINDER_OPTIONS.find((o) => o.days === days)?.label ?? `${days} days before`);
  });

  private previewSubscription: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPreview());
    // A vault document's preview doesn't outlive the unlock.
    effect(() => {
      if (this.vaultUntil() === null && this.document()?.isVault) {
        this.previewSubscription?.unsubscribe();
        this.previewLoading.set(null);
        this.clearPreview();
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.documentsService.get(Number(this.id())).subscribe({
      next: (document) => {
        this.loadFailed.set(false);
        this.setDocument(document);
      },
      error: (err) => {
        this.loadFailed.set(true);
        this.toast.error(apiErrorMessage(err, 'Could not load the document.'));
      },
    });
  }

  /** New data for the page; the preview follows the first previewable file unless the shown one still exists. */
  private setDocument(document: LifeDocument): void {
    this.document.set(document);
    const shown = this.preview();
    if (shown && document.files.some((f) => f.id === shown.fileId)) {
      return;
    }
    // A vault document shows nothing until it's unlocked; opening the page never asks for the password by itself.
    const first = document.files.find((f) => previewKind(f) !== null);
    if (first && (!document.isVault || this.vault.isUnlocked())) {
      this.showPreview(first);
    } else {
      this.clearPreview();
    }
  }

  protected async showPreview(file: DocumentFile): Promise<void> {
    const kind = previewKind(file);
    const document = this.document();
    if (!kind || !document || !(await this.ensureAccess(document))) {
      return;
    }

    this.previewSubscription?.unsubscribe();
    this.previewLoading.set(file.id);
    this.previewSubscription = this.documentsService.fileBlob(document.id, file).subscribe({
      next: async (blob) => {
        this.clearPreview();
        if (kind === 'text') {
          this.preview.set({
            fileId: file.id,
            kind,
            url: null,
            frameUrl: null,
            text: await blob.text(),
          });
        } else {
          const url = URL.createObjectURL(blob);
          this.preview.set({
            fileId: file.id,
            kind,
            url,
            frameUrl: kind === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null,
            text: null,
          });
        }
        this.previewLoading.set(null);
      },
      error: (err) => {
        this.previewLoading.set(null);
        this.onFileError(err, `Could not open "${file.originalName}".`);
      },
    });
  }

  /** Unlocked already, or asks for the password; true for an ordinary document. */
  private ensureAccess(document: LifeDocument): Promise<boolean> {
    return document.isVault
      ? ensureVaultUnlocked(this.modal, this.vault, `"${document.title}" is in your vault.`)
      : Promise.resolve(true);
  }

  /** 423: the unlock ran out on the server first — lock here too so the next try asks again. */
  private onFileError(err: unknown, fallback: string): void {
    if ((err as { status?: number }).status === 423) {
      this.vault.lock();
      this.toast.error('The vault locked again. Open the file once more to unlock it.');
      return;
    }
    this.toast.error(apiErrorMessage(err, fallback));
  }

  protected async unlockVault(): Promise<void> {
    const document = this.document();
    if (document && (await this.ensureAccess(document))) {
      this.setDocument(document);
    }
  }

  protected lockVault(): void {
    this.vault.lock();
  }

  private clearPreview(): void {
    const url = this.preview()?.url;
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.preview.set(null);
  }

  protected async download(file: DocumentFile): Promise<void> {
    const document = this.document();
    if (!document || !(await this.ensureAccess(document))) {
      return;
    }
    this.documentsService.fileBlob(document.id, file).subscribe({
      next: (blob) => saveBlob(blob, file.originalName),
      error: (err) => this.onFileError(err, `Could not download "${file.originalName}".`),
    });
  }

  // Drag and drop: the zone highlights while files are over it; dropping uploads them.
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
    const document = this.document();
    if (!document || files.length === 0 || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.documentsService.uploadFiles(document.id, files).subscribe({
      next: (updated) => {
        this.uploading.set(false);
        this.setDocument(updated);
        this.toast.success(files.length === 1 ? 'File added.' : `${files.length} files added.`);
      },
      error: (err) => {
        this.uploading.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not upload the files.'));
      },
    });
  }

  protected onReplace(file: DocumentFile, event: Event): void {
    const input = event.target as HTMLInputElement;
    const replacement = input.files?.[0];
    input.value = '';
    const document = this.document();
    if (!replacement || !document) {
      return;
    }
    this.documentsService.replaceFile(document.id, file.id, replacement).subscribe({
      next: (updated) => {
        this.setDocument(updated);
        this.toast.success(`"${file.originalName}" replaced.`);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not replace the file.')),
    });
  }

  protected async removeFile(file: DocumentFile): Promise<void> {
    const document = this.document();
    if (!document) {
      return;
    }
    const answer = await Swal.fire({
      title: `Remove "${file.originalName}"?`,
      text: 'The document stays; only this file goes.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove file',
      confirmButtonColor: '#dc3545',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.documentsService.removeFile(document.id, file.id).subscribe({
      next: (updated) => {
        this.setDocument(updated);
        this.toast.success('File removed.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the file.')),
    });
  }

  protected async edit(): Promise<void> {
    const document = this.document();
    if (!document) {
      return;
    }
    const saved = await openDocumentEditor(this.modal, document);
    if (saved) {
      this.setDocument(saved);
      this.toast.success('Document saved.');
    }
  }

  protected async remove(): Promise<void> {
    const document = this.document();
    if (!document) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${document.title}"?`,
      text: 'Its files, links and reminders go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete document',
      confirmButtonColor: '#dc3545',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.documentsService.remove(document.id).subscribe({
      next: () => {
        this.toast.success('Document deleted.');
        void this.router.navigate(['/documents']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the document.')),
    });
  }
}
