import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import {
  SEARCH_MIN_LENGTH,
  SearchGroup,
  SearchResult,
  SearchService,
} from '../../core/services/search.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { EntityOpener } from './entity-opener';
import { SEARCH_GROUP_LABELS, SEARCH_TYPE_ICONS, highlightParts, moveActive } from './search-text';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; groups: SearchGroup[] }
  | { kind: 'failed'; message: string };

/**
 * The global search palette (Ctrl+K / "/"): type, see matches grouped by kind, arrow keys + Enter (or a click) to
 * open one. A combobox over a listbox, so screen readers follow the highlighted row while focus stays in the box.
 */
@Component({
  selector: 'app-search-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-palette.html',
  styleUrl: './search-palette.scss',
})
export class SearchPalette {
  private readonly searchService = inject(SearchService);
  private readonly entityOpener = inject(EntityOpener);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly icons = SEARCH_TYPE_ICONS;
  protected readonly labels = SEARCH_GROUP_LABELS;
  protected readonly highlight = highlightParts;
  protected readonly minLength = SEARCH_MIN_LENGTH;

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');
  protected readonly state = signal<SearchState>({ kind: 'idle' });
  protected readonly active = signal(-1);

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? state.message : null;
  });

  /** The groups with each one's first row number, so every row has one index for the arrow keys. */
  protected readonly groups = computed(() => {
    const state = this.state();
    if (state.kind !== 'done') {
      return [];
    }
    let offset = 0;
    return state.groups.map((group) => {
      const start = offset;
      offset += group.items.length;
      return { ...group, offset: start };
    });
  });

  private readonly rows = computed(() => this.groups().flatMap((group) => group.items));

  constructor() {
    toObservable(this.query)
      .pipe(
        map((q) => q.trim()),
        distinctUntilChanged(),
        tap((q) =>
          this.state.set(q.length < SEARCH_MIN_LENGTH ? { kind: 'idle' } : { kind: 'loading' }),
        ),
        debounceTime(200),
        switchMap((q) =>
          q.length < SEARCH_MIN_LENGTH
            ? of<SearchState>({ kind: 'idle' })
            : this.searchService.search(q).pipe(
                map((groups): SearchState => ({ kind: 'done', groups })),
                catchError((err) =>
                  of<SearchState>({
                    kind: 'failed',
                    message: apiErrorMessage(err, "Couldn't search just now."),
                  }),
                ),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        // The first match is ready for Enter.
        this.active.set(state.kind === 'done' && state.groups.length > 0 ? 0 : -1);
      });
  }

  protected optionId(index: number): string {
    return `search-option-${index}`;
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(
          moveActive(this.active(), this.rows().length, event.key === 'ArrowDown' ? 1 : -1),
        );
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const row = this.rows()[this.active()];
        if (row) {
          this.open(row);
        }
        break;
      }
    }
  }

  protected open(row: SearchResult): void {
    this.activeModal.close();
    this.entityOpener.open(row.entityType, row.entityId);
  }

  private scrollActiveIntoView(): void {
    const id = this.optionId(this.active());
    this.list()?.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' });
  }
}
