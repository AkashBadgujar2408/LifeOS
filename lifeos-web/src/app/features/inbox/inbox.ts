import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';
import Swal from 'sweetalert2';
import {
  INBOX_ENTITY_TYPE,
  INBOX_KINDS,
  InboxItem,
  InboxKind,
  InboxService,
} from '../../core/services/inbox.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { openTaskEditor } from '../tasks/task-editor';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { toLocalIsoDate, todayIso } from '../../core/dates/today';
import { JournalService } from '../../core/services/journal.service';
import { Router } from '@angular/router';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';
import { SettingsService } from '../../core/services/settings.service';

const KIND_ICONS: Record<InboxKind, string> = {
  Task: 'bi-check2-square',
  Note: 'bi-sticky',
  Journal: 'bi-journal-text',
  Idea: 'bi-lightbulb',
};

@Component({
  selector: 'app-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, DatePipe, LinkedItems],
  templateUrl: './inbox.html',
})
export class Inbox {
  private readonly inboxService = inject(InboxService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modal = inject(NgbModal);
  private readonly journalService = inject(JournalService);
  private readonly router = inject(Router);
  /** "Make it a media item" only while Leisure is switched on. */
  private readonly hiddenModules = inject(SettingsService).hiddenModules;
  protected readonly leisureOn = computed(() => !this.hiddenModules().has('Leisure'));

  protected readonly kinds = INBOX_KINDS;
  protected readonly kindIcons = KIND_ICONS;
  protected readonly inboxEntityType = INBOX_ENTITY_TYPE;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly items = signal<InboxItem[]>([]);
  protected readonly loading = signal(true);
  /** The last load failed: show the retry block, not the empty state (which would say "you have none"). */
  protected readonly loadFailed = signal(false);
  protected readonly kindFilter = signal<InboxKind | null>(null);
  protected readonly showProcessed = signal(false);
  protected readonly expandedLinksId = signal<number | null>(null);
  /** The item being turned into a journal entry. */
  protected readonly processingId = signal<number | null>(null);

  protected readonly visibleItems = computed(() => {
    const kind = this.kindFilter();
    return kind ? this.items().filter((i) => i.kind === kind) : this.items();
  });

  protected readonly openCounts = computed(() => {
    const counts = new Map<InboxKind, number>();
    for (const item of this.items()) {
      if (!item.processedAt) {
        counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
      }
    }
    return counts;
  });

  constructor() {
    // Reload on filter change and whenever Quick Add captures something (possibly from this very screen).
    effect(() => {
      this.inboxService.capturedVersion();
      this.load(this.showProcessed());
    });
  }

  protected toggleLinks(id: number): void {
    this.expandedLinksId.update((current) => (current === id ? null : id));
  }

  protected setProcessed(item: InboxItem, processed: boolean): void {
    this.inboxService
      .setProcessed(item.id, processed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          if (processed && !this.showProcessed()) {
            this.items.update((items) => items.filter((i) => i.id !== item.id));
          } else {
            this.items.update((items) => items.map((i) => (i.id === item.id ? updated : i)));
          }
          this.toast.success(processed ? 'Marked as processed.' : 'Moved back to open.');
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not update item.')),
      });
  }

  /**
   * Turns a captured Idea ("Watch Severance") into a media item: the editor opens with the kind and title read from
   * it; the API moves its links and marks it processed. The editor is loaded on demand (keeps Leisure out of here).
   */
  protected async makeMediaItem(item: InboxItem): Promise<void> {
    const [{ openMediaEditor }, { guessFromIdea }] = await Promise.all([
      import('../leisure/media-editor'),
      import('../leisure/leisure-view'),
    ]);
    const saved = await openMediaEditor(this.modal, undefined, {
      ...guessFromIdea(item.title),
      inboxItemId: item.id,
    });
    if (!saved) {
      return;
    }
    this.inboxService.refreshOpenCounts();
    this.load(this.showProcessed());
    this.toast.success(`"${saved.title}" is now on your Leisure list.`);
  }

  /** Turns a captured Task into a real one (the API keeps its links and marks it processed). */
  protected async makeTask(item: InboxItem): Promise<void> {
    const result = await openTaskEditor(this.modal, {
      inboxItemId: item.id,
      defaults: { title: item.title, notes: item.notes },
    });
    if (result?.kind !== 'saved') {
      return;
    }

    this.inboxService.refreshOpenCounts();
    this.load(this.showProcessed());
    this.toast.success(`"${result.task.title}" is now in Tasks.`);
  }

  /**
   * Turns a captured Journal thought into the journal entry for the day it was captured (appended if that day
   * already has one); the API moves its links and marks it processed. Then opens that day.
   */
  protected makeJournalEntry(item: InboxItem): void {
    const day = toLocalIsoDate(new Date(item.createdAt));
    this.processingId.set(item.id);
    this.journalService
      .createFromInbox(item.id, day)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => {
          this.processingId.set(null);
          this.inboxService.refreshOpenCounts();
          this.toast.success('Added to your journal.');
          void this.router.navigate(
            entry.entryDate === todayIso() ? ['/journal'] : ['/journal', entry.entryDate],
          );
        },
        error: (err) => {
          this.processingId.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not add it to the journal.'));
        },
      });
  }

  protected async remove(item: InboxItem): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete this item?',
      text: `"${item.title}" and its links will be removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.inboxService
      .remove(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items.update((items) => items.filter((i) => i.id !== item.id));
          this.toast.success('Item deleted.');
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete item.')),
      });
  }

  protected load(includeProcessed: boolean): void {
    this.loading.set(true);
    this.inboxService
      .list(includeProcessed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your inbox.'));
        },
      });
  }
}
