import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  isDevMode,
  output,
  signal,
} from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  CellApiModule,
  CellKeyDownEvent,
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColDef,
  FullWidthCellKeyDownEvent,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  ModuleRegistry,
  PaginationChangedEvent,
  PaginationModule,
  QuickFilterModule,
  RowApiModule,
  RowClickedEvent,
  RowStyleModule,
  ValidationModule,
  themeQuartz,
} from 'ag-grid-community';
import { todayIso } from '../dates/today';
import { saveBlob } from '../files/files';
import { buildCsv, csvFileName } from './grid-csv';

// Only what LifeOS grids use: client-side rows, paging, the search box, row/cell classes, and the row/cell APIs the
// count and CSV export read (ValidationModule explains a missing module in development; it's tree-shaken from
// production builds). This file is only imported by lazy
// routes, so ag-Grid stays out of the shell bundle.
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  RowApiModule,
  CellApiModule,
  PaginationModule,
  QuickFilterModule,
  RowStyleModule,
  CellStyleModule,
  ...(isDevMode() ? [ValidationModule] : []),
]);

/** Every grid in LifeOS tokens: hairline borders, the body font, teal for focus and selection. */
export const LIFEOS_GRID_THEME = themeQuartz.withParams({
  fontFamily: 'inherit',
  accentColor: 'var(--lifeos-teal)',
  borderColor: 'var(--lifeos-border)',
  foregroundColor: 'var(--lifeos-ink)',
  backgroundColor: 'var(--cui-body-bg, #fff)',
  headerBackgroundColor: 'var(--lifeos-canvas)',
  wrapperBorderRadius: '0.375rem',
});

export const GRID_PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

/**
 * A column's CSV text when it shouldn't be what the cell shows (e.g. an amount without the "+" a spreadsheet would
 * take for a formula). Set as `context: { csv: (row) => ... }` on the column.
 */
export interface GridColumnContext<T> {
  csv?: (row: T) => string;
}

/** True on a phone-sized screen, where a grid shows only its `phoneColumns`. */
export function isNarrowScreen(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 575.98px)').matches;
}

function storedPageSize(name: string): number {
  try {
    const value = Number(localStorage.getItem(`lifeos.grid.${name}.pageSize`));
    return GRID_PAGE_SIZES.includes(value) ? value : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

function storePageSize(name: string, size: number): void {
  try {
    localStorage.setItem(`lifeos.grid.${name}.pageSize`, String(size));
  } catch {
    // A convenience only — private windows and blocked storage just forget it.
  }
}

/**
 * The one grid for heavy lists (Session 75a): ag-Grid with 25/50/100-row pages (the size remembered per list), the
 * page's search text as a quick filter, a phone column set, Enter or a click opening a row, and "Export CSV" of the
 * filtered + sorted rows on every page, formatted as shown. `beforeExport` can refuse or log an export (Health asks
 * for the vault and logs it). Totals stay with the page (from the server for server-filtered lists).
 */
@Component({
  selector: 'app-data-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgGridAngular],
  template: `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
      <span class="small text-body-secondary" aria-live="polite">{{ countText() }}</span>
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        [disabled]="shown() === 0 || exporting()"
        (click)="exportCsv()"
      >
        <i class="bi bi-filetype-csv"></i> Export CSV
      </button>
    </div>
    <ag-grid-angular
      class="d-block lifeos-grid"
      [class.lifeos-grid-clickable]="clickable()"
      domLayout="autoHeight"
      [theme]="theme"
      [rowData]="rows()"
      [columnDefs]="shownColumns()"
      [defaultColDef]="defaultColumn"
      [quickFilterText]="search()"
      [getRowId]="rowId() ? getRowId : undefined"
      [animateRows]="false"
      [pagination]="true"
      [paginationPageSize]="pageSize()"
      [paginationPageSizeSelector]="pageSizes"
      (gridReady)="ready($event)"
      (modelUpdated)="counted()"
      (paginationChanged)="paged($event)"
      (rowClicked)="clicked($event)"
      (cellKeyDown)="keyed($event)"
    />
  `,
})
export class DataGrid<T> {
  /** Names the list: the CSV file ("lifeos-<name>-<day>.csv") and the remembered page size. */
  readonly name = input.required<string>();
  readonly rows = input.required<T[]>();
  readonly columns = input.required<ColDef<T>[]>();
  /** Column ids (colId, else field) shown on a phone; empty = every column. */
  readonly phoneColumns = input<string[]>([]);
  readonly search = input('');
  readonly rowId = input<((row: T) => string | number) | null>(null);
  /** Resolves false to cancel an export (e.g. the vault stayed locked). */
  readonly beforeExport = input<(() => Promise<boolean>) | null>(null);
  /** Singular/plural words for the count line, e.g. ['workout', 'workouts']. */
  readonly noun = input<[string, string]>(['row', 'rows']);
  /** False for a list whose rows open nothing (no pointer cursor). */
  readonly clickable = input(true);

  readonly open = output<T>();

  protected readonly theme = LIFEOS_GRID_THEME;
  protected readonly pageSizes = GRID_PAGE_SIZES;
  protected readonly pageSize = computed(() => storedPageSize(this.name()));
  protected readonly defaultColumn: ColDef<T> = { sortable: true, resizable: true };
  protected readonly shown = signal(0);
  protected readonly exporting = signal(false);
  private api: GridApi<T> | null = null;
  private readonly narrow = isNarrowScreen();

  protected readonly getRowId = (params: GetRowIdParams<T>) => {
    const id = this.rowId();
    return id ? String(id(params.data)) : '';
  };

  protected readonly shownColumns = computed<ColDef<T>[]>(() => {
    const phone = this.phoneColumns();
    if (!this.narrow || phone.length === 0) {
      return this.columns();
    }
    return this.columns().map((c) =>
      phone.includes(c.colId ?? String(c.field)) ? c : { ...c, hide: true },
    );
  });

  protected readonly countText = computed(() => {
    const [one, many] = this.noun();
    const shown = this.shown();
    const total = this.rows().length;
    const word = total === 1 ? one : many;
    return shown === total ? `${total} ${word}` : `${shown} of ${total} ${word}`;
  });

  protected ready(event: GridReadyEvent<T>): void {
    this.api = event.api;
    this.counted();
  }

  protected counted(): void {
    this.shown.set(this.api?.getDisplayedRowCount() ?? this.rows().length);
  }

  protected paged(event: PaginationChangedEvent<T>): void {
    if (event.newPageSize) {
      storePageSize(this.name(), event.api.paginationGetPageSize());
    }
  }

  protected clicked(event: RowClickedEvent<T>): void {
    if (event.data) {
      this.open.emit(event.data);
    }
  }

  /** Enter on a focused cell opens its row, as a click does. */
  protected keyed(event: CellKeyDownEvent<T> | FullWidthCellKeyDownEvent<T>): void {
    if ((event.event as KeyboardEvent | null)?.key === 'Enter' && event.data) {
      this.open.emit(event.data);
    }
  }

  /** The filtered + sorted rows of every page, the columns a wide screen shows, each cell as displayed. */
  protected async exportCsv(): Promise<void> {
    const api = this.api;
    if (!api || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    try {
      const guard = this.beforeExport();
      if (guard && !(await guard())) {
        return;
      }
      const columns = this.columns().filter((c) => !c.hide);
      const header = columns.map((c) => c.headerName ?? c.field ?? '');
      const rows: string[][] = [];
      api.forEachNodeAfterFilterAndSort((node) => {
        if (!node.data) {
          return;
        }
        const data = node.data;
        rows.push(
          columns.map((c) => {
            const csv = (c.context as GridColumnContext<T> | undefined)?.csv;
            if (csv) {
              return csv(data);
            }
            const value = api.getCellValue({
              rowNode: node,
              colKey: c.colId ?? String(c.field),
              useFormatter: true,
            });
            return value === null || value === undefined ? '' : String(value);
          }),
        );
      });
      const blob = new Blob([buildCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
      saveBlob(blob, csvFileName(this.name(), todayIso()));
    } finally {
      this.exporting.set(false);
    }
  }
}
