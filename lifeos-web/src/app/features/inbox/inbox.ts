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

const KIND_ICONS: Record<InboxKind, string> = {
  Task: 'bi-check2-square',
  Note: 'bi-sticky',
  Journal: 'bi-journal-text',
  Idea: 'bi-lightbulb',
};

@Component({
  selector: 'app-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LinkedItems],
  templateUrl: './inbox.html',
})
export class Inbox {
  private readonly inboxService = inject(InboxService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modal = inject(NgbModal);

  protected readonly kinds = INBOX_KINDS;
  protected readonly kindIcons = KIND_ICONS;
  protected readonly inboxEntityType = INBOX_ENTITY_TYPE;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly items = signal<InboxItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly kindFilter = signal<InboxKind | null>(null);
  protected readonly showProcessed = signal(false);
  protected readonly expandedLinksId = signal<number | null>(null);

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
        error: (err) => this.toast.error(err.error?.message ?? 'Could not update item.'),
      });
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

  protected async remove(item: InboxItem): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete this item?',
      text: `"${item.title}" and its links will be removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
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
        error: (err) => this.toast.error(err.error?.message ?? 'Could not delete item.'),
      });
  }

  private load(includeProcessed: boolean): void {
    this.loading.set(true);
    this.inboxService
      .list(includeProcessed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load your inbox.');
        },
      });
  }
}
