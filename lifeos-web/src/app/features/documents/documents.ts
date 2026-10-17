import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  DocumentSummary,
  DocumentsService,
} from '../../core/services/documents.service';
import { TagsService } from '../../core/services/tags.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openDocumentEditor } from './document-editor';
import { KIND_META, expiryStatus, groupByKind } from './document-view';

/** The document library: by kind, filtered by kind, tag and text (title, issuer, notes), with expiry badges. */
@Component({
  selector: 'app-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './documents.html',
})
export class Documents {
  private readonly documentsService = inject(DocumentsService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);

  protected readonly kinds = DOCUMENT_KINDS;
  protected readonly kindMeta = KIND_META;
  protected readonly expiryStatus = expiryStatus;
  protected readonly today = todayIso();

  protected readonly tags = toSignal(
    inject(TagsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly kind = signal<DocumentKind | null>(null);
  protected readonly tagId = signal<number | null>(null);
  protected readonly search = signal('');

  protected readonly documents = signal<DocumentSummary[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly groups = computed(() => groupByKind(this.documents()));
  protected readonly filtered = computed(
    () => !!this.kind() || !!this.tagId() || this.search().trim().length > 0,
  );
  /** Expired or expiring within 60 days, across whatever is listed. */
  protected readonly needAttention = computed(
    () =>
      this.documents().filter((d) =>
        ['expired', 'today', 'soon'].includes(expiryStatus(d.expiresOn, this.today).state),
      ).length,
  );

  /** Bumped by Retry, so the same filters load again. */
  private readonly refresh = signal(0);

  private readonly filter = computed(() => ({
    refresh: this.refresh(),
    kind: this.kind(),
    tagId: this.tagId(),
    search: this.search(),
  }));

  constructor() {
    toObservable(this.filter)
      .pipe(
        // Typing waits a moment; picking a kind or tag is just as quick (it's the same pipe).
        debounceTime(250),
        tap(() => this.loading.set(true)),
        switchMap((filter) =>
          this.documentsService.list(filter).pipe(
            catchError((err) => {
              this.loadFailed.set(true);
              this.toast.error(apiErrorMessage(err, 'Could not load your documents.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((documents) => {
        this.loading.set(false);
        if (documents) {
          this.documents.set(documents);
          this.loaded.set(true);
          this.loadFailed.set(false);
        }
      });
  }

  protected reload(): void {
    this.refresh.update((n) => n + 1);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onKind(event: Event): void {
    this.kind.set(((event.target as HTMLSelectElement).value || null) as DocumentKind | null);
  }

  protected onTag(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.tagId.set(value ? Number(value) : null);
  }

  protected clearFilters(): void {
    this.kind.set(null);
    this.tagId.set(null);
    this.search.set('');
  }

  protected async newDocument(): Promise<void> {
    const saved = await openDocumentEditor(this.modal);
    if (saved) {
      this.toast.success('Document added. Now add its scans or files.');
      void this.router.navigate(['/documents', saved.id]);
    }
  }
}
