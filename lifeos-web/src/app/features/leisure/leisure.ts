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
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  LeisureService,
  MEDIA_KINDS,
  MediaItem,
  MediaKind,
} from '../../core/services/leisure.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import {
  BACKLOG_GROUP_LABELS,
  MEDIA_KIND_INFO,
  groupBacklog,
  hasEpisodes,
  progressText,
  stars,
  statusLabel,
} from './leisure-view';
import { openMediaEditor } from './media-editor';

/**
 * The media backlog (Session 78b): books, films, series, games, albums and podcasts — in progress, up next, the rest
 * of the list, finished and dropped. `?kind=Book` narrows it to one kind (Learning's old reading list lands here).
 */
@Component({
  selector: 'app-leisure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './leisure.html',
})
export class Leisure {
  private readonly leisureService = inject(LeisureService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** From the `?kind=` query parameter. */
  readonly kind = input<string | undefined>();

  protected readonly kinds = MEDIA_KINDS;
  protected readonly kindInfo = MEDIA_KIND_INFO;
  protected readonly groupLabels = BACKLOG_GROUP_LABELS;
  protected readonly progressText = progressText;
  protected readonly statusLabel = statusLabel;
  protected readonly hasEpisodes = hasEpisodes;
  protected readonly stars = stars;

  protected readonly items = signal<MediaItem[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showDropped = signal(false);
  protected readonly stepping = signal<number | null>(null);

  protected readonly activeKind = computed<MediaKind | null>(() => {
    const k = this.kind();
    return (MEDIA_KINDS as readonly string[]).includes(k ?? '') ? (k as MediaKind) : null;
  });
  protected readonly shown = computed(() => {
    const kind = this.activeKind();
    return (this.items() ?? []).filter((i) => !kind || i.kind === kind);
  });
  protected readonly groups = computed(() =>
    groupBacklog(this.shown()).filter((g) => g.key !== 'Dropped' || this.showDropped()),
  );
  protected readonly droppedCount = computed(
    () => this.shown().filter((i) => i.status === 'Dropped').length,
  );
  protected readonly finishedThisYear = computed(() => {
    const year = todayIso().slice(0, 4);
    return this.shown().filter((i) => i.finishedOn?.startsWith(year)).length;
  });
  protected readonly countsByKind = computed(() => {
    const counts = new Map<MediaKind, number>();
    for (const item of this.items() ?? []) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return counts;
  });

  constructor() {
    effect(() => {
      this.kind();
      untracked(() => {
        if (this.items() === null) {
          this.load();
        }
      });
    });
  }

  protected load(): void {
    this.leisureService
      .mediaItems()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected filter(kind: MediaKind | null): void {
    void this.router.navigate([], { queryParams: { kind: kind ?? null }, replaceUrl: true });
  }

  protected async add(): Promise<void> {
    const saved = await openMediaEditor(this.modal, undefined, {
      kind: this.activeKind() ?? undefined,
    });
    if (saved) {
      this.toast.success(`"${saved.title}" added.`);
      void this.router.navigate(['/leisure', saved.id]);
    }
  }

  /** "Next episode" on a show in progress — the API keeps its status consistent. */
  protected nextEpisode(item: MediaItem): void {
    this.stepping.set(item.id);
    this.leisureService
      .setProgress(item.id, {
        season: item.season,
        episode: (item.episode ?? 0) + 1,
        today: todayIso(),
      })
      .subscribe({
        next: (saved) => {
          this.stepping.set(null);
          this.items.update((list) => list?.map((i) => (i.id === saved.id ? saved : i)) ?? list);
        },
        error: (err) => {
          this.stepping.set(null);
          this.toast.error(apiErrorMessage(err, 'Could not move to the next episode.'));
        },
      });
  }
}
