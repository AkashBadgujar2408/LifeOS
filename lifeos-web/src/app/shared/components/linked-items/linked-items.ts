import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { catchError, combineLatest, debounceTime, of, switchMap } from 'rxjs';
import {
  EntityLinksService,
  LinkableItem,
  LinkedItem,
} from '../../../core/services/entity-links.service';

/**
 * Shows everything an entity is linked to (in either direction) and lets the user add/remove links.
 * Drop it on any detail screen: <app-linked-items entityType="Goal" [entityId]="goal.id" />.
 */
@Component({
  selector: 'app-linked-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './linked-items.html',
})
export class LinkedItems {
  private readonly entityLinksService = inject(EntityLinksService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<number>();
  /** Type the picker starts on (e.g. "Goal" from a task); defaults to the first registered type. */
  readonly preferredLinkType = input<string>();

  protected readonly links = signal<LinkedItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly pickerOpen = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly targetType = signal('');

  protected readonly types = toSignal(this.entityLinksService.types(), { initialValue: [] });

  private readonly displayNames = computed(
    () => new Map(this.types().map((t) => [t.entityType, t.displayName])),
  );

  private readonly rawCandidates = toSignal(
    combineLatest([
      toObservable(this.targetType),
      toObservable(this.searchTerm).pipe(debounceTime(250)),
      toObservable(this.pickerOpen),
    ]).pipe(
      switchMap(([type, search, open]) =>
        open && type
          ? this.entityLinksService
              .searchCandidates(type, search, {
                entityType: this.entityType(),
                entityId: this.entityId(),
              })
              .pipe(catchError(() => of<LinkableItem[]>([])))
          : of<LinkableItem[]>([]),
      ),
    ),
    { initialValue: [] },
  );

  /** Candidates minus anything already linked, so the list only ever offers valid new links. */
  protected readonly candidates = computed(() => {
    const linked = new Set(this.links().map((l) => `${l.entityType}:${l.entityId}`));
    return this.rawCandidates().filter((c) => !linked.has(`${c.entityType}:${c.entityId}`));
  });

  constructor() {
    effect(() => {
      const types = this.types();
      if (!this.targetType() && types.length > 0) {
        const preferred = types.find((t) => t.entityType === this.preferredLinkType());
        this.targetType.set((preferred ?? types[0]).entityType);
      }
    });

    effect(() => this.loadLinks(this.entityType(), this.entityId()));
  }

  protected displayName(entityType: string): string {
    return this.displayNames().get(entityType) ?? entityType;
  }

  protected togglePicker(): void {
    this.pickerOpen.update((open) => !open);
    this.searchTerm.set('');
  }

  protected link(candidate: LinkableItem): void {
    this.entityLinksService
      .create({ entityType: this.entityType(), entityId: this.entityId() }, candidate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => this.links.update((links) => [...links, created]),
        error: (err) => this.toast.error(err.error?.message ?? 'Could not create link.'),
      });
  }

  protected unlink(link: LinkedItem): void {
    this.entityLinksService
      .remove(link.linkId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.links.update((links) => links.filter((l) => l.linkId !== link.linkId)),
        error: (err) => this.toast.error(err.error?.message ?? 'Could not remove link.'),
      });
  }

  private loadLinks(entityType: string, entityId: number): void {
    this.loading.set(true);
    this.entityLinksService
      .list(entityType, entityId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          this.links.set(links);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load linked items.');
        },
      });
  }
}
