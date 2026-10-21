import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ColDef } from 'ag-grid-community';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { saveBlob } from '../../core/files/files';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService, ImportResult } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney } from './finance-view';
import {
  DATE_FORMATS,
  MappedRow,
  SAMPLE_STATEMENT_CSV,
  StatementMapping,
  guessMapping,
  guessStatementMapping,
  mapStatement,
  parseCsv,
} from './statement-csv';

/** How many of the first rows can be picked as the one holding the column names. */
const HEADER_CHOICE_ROWS = 30;
/** Matches StatementImport.MaxLines on the server. */
const MAX_LINES = 5000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Importing a bank statement (CSV) into one account: read the file here, say which column is which, check it with
 * the server (which lines are new, which were imported before, which are wrong), then import — all or nothing.
 * Importing the same statement again adds nothing.
 */
@Component({
  selector: 'app-statement-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TagPicker, BaseCurrencyPrompt, DataGrid],
  template: `
    <div class="container py-4">
      <div class="mb-4">
        <a routerLink="/finance/transactions" class="small text-decoration-none">
          <i class="bi bi-arrow-left"></i> Transactions
        </a>
        <h1 class="h3 mb-1 mt-2">Import a bank statement</h1>
        <p class="text-body-secondary mb-0 small">
          Download your statement as CSV from your bank, then bring it in here. Lines you've
          imported before are skipped, so overlapping statements are fine.
        </p>
      </div>

      <app-base-currency-prompt />

      <section class="card mb-4">
        <div class="card-body">
          <h2 class="h6">1. The account and the file</h2>
          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label" for="import-account">Into account</label>
              <select
                id="import-account"
                class="form-select"
                [class.is-invalid]="accountError()"
                [ngModel]="accountId()"
                (ngModelChange)="accountId.set($event); resetCheck()"
              >
                <option [ngValue]="null" [selected]="accountId() === null" disabled>Choose…</option>
                @for (a of accounts(); track a.id) {
                  <option [ngValue]="a.id" [selected]="a.id === accountId()">
                    {{ a.name }} ({{ a.currency }})
                  </option>
                }
              </select>
              @if (accountError()) {
                <div class="invalid-feedback d-block">Choose the account the statement is for.</div>
              }
            </div>
            <div class="col-md-7">
              <label class="form-label" for="import-file">Statement (.csv)</label>
              <input
                id="import-file"
                type="file"
                class="form-control"
                accept=".csv,.txt,text/csv"
                (change)="readFile($event)"
              />
              @if (fileError(); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              } @else if (fileName()) {
                <div class="form-text">{{ fileName() }} · {{ rows().length }} rows</div>
              }
            </div>
          </div>

          <div class="border-top mt-3 pt-3">
            <h3 class="h6 mb-2">What file works</h3>
            <ul class="small mb-2 ps-3">
              <li>
                <strong>Any CSV your bank gives you</strong> — there's no fixed layout. After you
                choose it, you say which column is which.
              </li>
              <li>
                It needs a <strong>date</strong>, an <strong>amount</strong> (one column with minus
                for money out, or separate money-out and money-in columns) and a
                <strong>description</strong>. A reference number is optional.
              </li>
              <li>
                Commas, semicolons or tabs between columns; dates like 14/10/2026, 10/14/2026,
                2026-10-14, 14-10-2026, 14.10.2026, 14 Oct 2026 or 14/10/26; amounts like 1,234.56,
                1.234,56, (1,234.56) or 1,234.56 Dr. Account details above the table are fine.
              </li>
              <li>
                Bank gives Excel only? Open it and use <em>File › Save As › CSV UTF-8</em>. PDF
                statements can't be read.
              </li>
            </ul>
            <button type="button" class="btn btn-sm btn-outline-primary" (click)="downloadSample()">
              <i class="bi bi-download"></i> Download a sample CSV
            </button>
            <span class="small text-body-secondary ms-2">
              Fill it in by hand or copy your bank's lines into it.
            </span>
          </div>
        </div>
      </section>

      @if (rows().length) {
        <section class="card mb-4">
          <div class="card-body">
            <h2 class="h6">2. Which column is which</h2>
            <div class="mb-3">
              <label class="form-label" for="import-header">Column names are on</label>
              <select
                id="import-header"
                class="form-select"
                [ngModel]="mapping().headerRow"
                (ngModelChange)="setHeaderRow($event)"
              >
                <option [ngValue]="null" [selected]="mapping().headerRow === null">
                  No row — the file has no column names
                </option>
                @for (h of headerChoices(); track h.index) {
                  <option [ngValue]="h.index" [selected]="h.index === mapping().headerRow">
                    {{ h.label }}
                  </option>
                }
              </select>
              @if (mapping().headerRow; as row) {
                <div class="form-text">
                  {{ row === 1 ? 'Row 1 is' : 'Rows 1–' + row + ' are' }} above the column names
                  (account details) and left out.
                </div>
              }
            </div>
            <div class="row g-3">
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="map-date">Date</label>
                <select
                  id="map-date"
                  class="form-select"
                  [ngModel]="mapping().date"
                  (ngModelChange)="patch({ date: $event })"
                >
                  <option [ngValue]="null" [selected]="mapping().date === null" disabled>
                    Choose…
                  </option>
                  @for (c of columns(); track c.index) {
                    <option [ngValue]="c.index" [selected]="c.index === mapping().date">
                      {{ c.label }}
                    </option>
                  }
                </select>
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="map-format">Date format</label>
                <select
                  id="map-format"
                  class="form-select"
                  [ngModel]="mapping().dateFormat"
                  (ngModelChange)="patch({ dateFormat: $event })"
                >
                  @for (f of dateFormats; track f) {
                    <option [ngValue]="f" [selected]="f === mapping().dateFormat">{{ f }}</option>
                  }
                </select>
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="map-description">Description</label>
                <select
                  id="map-description"
                  class="form-select"
                  [ngModel]="mapping().description"
                  (ngModelChange)="patch({ description: $event })"
                >
                  <option [ngValue]="null" [selected]="mapping().description === null">None</option>
                  @for (c of columns(); track c.index) {
                    <option [ngValue]="c.index" [selected]="c.index === mapping().description">
                      {{ c.label }}
                    </option>
                  }
                </select>
              </div>
              <div class="col-sm-6 col-lg-3">
                <label class="form-label" for="map-reference">Reference</label>
                <select
                  id="map-reference"
                  class="form-select"
                  [ngModel]="mapping().reference"
                  (ngModelChange)="patch({ reference: $event })"
                >
                  <option [ngValue]="null" [selected]="mapping().reference === null">None</option>
                  @for (c of columns(); track c.index) {
                    <option [ngValue]="c.index" [selected]="c.index === mapping().reference">
                      {{ c.label }}
                    </option>
                  }
                </select>
              </div>
            </div>
            <div
              class="btn-group btn-group-sm my-3"
              role="radiogroup"
              aria-label="How amounts are given"
            >
              <input
                type="radio"
                class="btn-check"
                id="mode-amount"
                name="amount-mode"
                [checked]="mapping().amountMode === 'amount'"
                (change)="patch({ amountMode: 'amount' })"
              />
              <label class="btn btn-outline-primary" for="mode-amount"
                >One amount column (+/−)</label
              >
              <input
                type="radio"
                class="btn-check"
                id="mode-split"
                name="amount-mode"
                [checked]="mapping().amountMode === 'split'"
                (change)="patch({ amountMode: 'split' })"
              />
              <label class="btn btn-outline-primary" for="mode-split"
                >Separate money out / in</label
              >
            </div>
            <div class="row g-3 align-items-end">
              @if (mapping().amountMode === 'amount') {
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label" for="map-amount">Amount</label>
                  <select
                    id="map-amount"
                    class="form-select"
                    [ngModel]="mapping().amount"
                    (ngModelChange)="patch({ amount: $event })"
                  >
                    <option [ngValue]="null" [selected]="mapping().amount === null" disabled>
                      Choose…
                    </option>
                    @for (c of columns(); track c.index) {
                      <option [ngValue]="c.index" [selected]="c.index === mapping().amount">
                        {{ c.label }}
                      </option>
                    }
                  </select>
                </div>
                <div class="col-sm-6 col-lg-4">
                  <div class="form-check">
                    <input
                      id="map-out-positive"
                      type="checkbox"
                      class="form-check-input"
                      [ngModel]="mapping().amountOutIsPositive"
                      (ngModelChange)="patch({ amountOutIsPositive: $event })"
                    />
                    <label class="form-check-label" for="map-out-positive">
                      Spending is positive (card statements)
                    </label>
                  </div>
                </div>
              } @else {
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label" for="map-debit">Money out</label>
                  <select
                    id="map-debit"
                    class="form-select"
                    [ngModel]="mapping().debit"
                    (ngModelChange)="patch({ debit: $event })"
                  >
                    <option [ngValue]="null" [selected]="mapping().debit === null" disabled>
                      Choose…
                    </option>
                    @for (c of columns(); track c.index) {
                      <option [ngValue]="c.index" [selected]="c.index === mapping().debit">
                        {{ c.label }}
                      </option>
                    }
                  </select>
                </div>
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label" for="map-credit">Money in</label>
                  <select
                    id="map-credit"
                    class="form-select"
                    [ngModel]="mapping().credit"
                    (ngModelChange)="patch({ credit: $event })"
                  >
                    <option [ngValue]="null" [selected]="mapping().credit === null" disabled>
                      Choose…
                    </option>
                    @for (c of columns(); track c.index) {
                      <option [ngValue]="c.index" [selected]="c.index === mapping().credit">
                        {{ c.label }}
                      </option>
                    }
                  </select>
                </div>
              }
              <div class="col-sm-6 col-lg-3">
                <div class="form-check">
                  <input
                    id="map-comma"
                    type="checkbox"
                    class="form-check-input"
                    [ngModel]="mapping().decimalComma"
                    (ngModelChange)="patch({ decimalComma: $event })"
                  />
                  <label class="form-check-label" for="map-comma">Decimal comma (1.234,56)</label>
                </div>
              </div>
            </div>
            <div class="mt-3">
              <span class="form-label d-block"
                >Tag every imported line
                <span class="text-body-secondary small">(optional)</span></span
              >
              <app-tag-picker
                [selectedTagIds]="tagIds()"
                (selectedTagIdsChange)="tagIds.set($event)"
              />
            </div>
          </div>
        </section>

        <section class="card mb-4">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
              <h2 class="h6 mb-0">3. Check and import</h2>
              <span class="small text-body-secondary">
                {{ readable().length }} readable
                @if (unreadable().length) {
                  · {{ unreadable().length }} can't be read
                }
                @if (result(); as r) {
                  · <strong class="text-body">{{ r.new }} new</strong> · {{ r.duplicates }} already
                  imported
                  @if (r.errors) {
                    · <span class="text-danger-emphasis">{{ r.errors }} with problems</span>
                  }
                }
              </span>
            </div>
            @if (unreadable().length) {
              <div class="form-check mb-2">
                <input
                  id="import-skip"
                  type="checkbox"
                  class="form-check-input"
                  [ngModel]="skipUnreadable()"
                  (ngModelChange)="skipUnreadable.set($event); resetCheck()"
                />
                <label class="form-check-label" for="import-skip">
                  Leave out lines that can't be read (totals, opening-balance rows)
                </label>
              </div>
            }
            <div class="mb-3">
              <app-data-grid
                name="statement-preview"
                [rows]="mapped()"
                [columns]="previewColumns()"
                [phoneColumns]="['line', 'description', 'amount']"
                [rowId]="previewRowId"
                [noun]="['line', 'lines']"
                [clickable]="false"
              />
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-outline-primary"
                [disabled]="busy()"
                (click)="check()"
              >
                <i class="bi bi-search"></i> Check
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="busy() || !canImport()"
                (click)="import()"
              >
                <i class="bi bi-box-arrow-in-down"></i>
                Import {{ result()?.new ?? '' }} {{ result()?.new === 1 ? 'line' : 'lines' }}
              </button>
            </div>
            @if (blocker(); as text) {
              <p class="small text-danger-emphasis mt-2 mb-0">{{ text }}</p>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class StatementImport {
  private readonly financeService = inject(FinanceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  protected readonly dateFormats = DATE_FORMATS;
  protected readonly accounts = toSignal(
    this.financeService.accounts().pipe(
      map((accounts) => accounts.filter((a) => !a.isArchived)),
      catchError(() => of([])),
    ),
    { initialValue: [] },
  );
  protected readonly accountId = signal<number | null>(null);
  protected readonly accountError = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly rows = signal<string[][]>([]);
  protected readonly mapping = signal<StatementMapping>(guessMapping([]));
  protected readonly tagIds = signal<number[]>([]);
  protected readonly skipUnreadable = signal(true);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly busy = signal(false);

  protected readonly currency = computed(
    () => this.accounts().find((a) => a.id === this.accountId())?.currency ?? 'INR',
  );

  /** Column choices: "B · Narration" (the header's name when there is one). */
  protected readonly columns = computed(() => {
    const rows = this.rows();
    const width = Math.max(0, ...rows.slice(0, 20).map((r) => r.length));
    const headerRow = this.mapping().headerRow;
    const header = headerRow === null ? [] : (rows[headerRow] ?? []);
    return Array.from({ length: width }, (_, index) => {
      const letter = index < 26 ? String.fromCharCode(65 + index) : `#${index + 1}`;
      return { index, label: header[index] ? `${letter} · ${header[index]}` : `Column ${letter}` };
    });
  });

  /** Rows the column names could be on: "Row 4 · Date, Narration, Chq./Ref.No. …". */
  protected readonly headerChoices = computed(() =>
    this.rows()
      .slice(0, HEADER_CHOICE_ROWS)
      .map((cells, index) => {
        const text = cells.filter((c) => c.trim()).join(', ');
        const short = text.length > 60 ? `${text.slice(0, 60)}…` : text;
        return { index, label: `Row ${index + 1} · ${short || '(empty)'}` };
      }),
  );

  protected readonly mapped = computed(() => mapStatement(this.rows(), this.mapping()));
  protected readonly readable = computed(() => this.mapped().filter((r) => r.line));
  protected readonly unreadable = computed(() => this.mapped().filter((r) => !r.line));
  protected readonly previewRowId = (r: MappedRow) => r.fileLine;

  /** Rebuilt when the check's results or "leave out" change, so the Status column re-reads. */
  protected readonly previewColumns = computed<ColDef<MappedRow>[]>(() => {
    this.serverStatus();
    this.skipUnreadable();
    const currency = this.currency();
    return [
      { headerName: 'Line', colId: 'line', field: 'fileLine', width: 85, type: 'rightAligned' },
      {
        headerName: 'Day',
        colId: 'day',
        width: 125,
        valueGetter: (p) => p.data?.line?.occurredOn ?? null,
        valueFormatter: dayFormatter(this.locale),
      },
      {
        headerName: 'Description',
        colId: 'description',
        flex: 2,
        minWidth: 180,
        valueGetter: (p) => (p.data ? (p.data.line?.description ?? this.rawText(p.data)) : ''),
      },
      {
        headerName: 'Amount',
        colId: 'amount',
        width: 140,
        type: 'rightAligned',
        valueGetter: (p) => p.data?.line?.amount ?? null,
        valueFormatter: (p) =>
          p.value === null || p.value === undefined
            ? ''
            : (p.value > 0 ? '+' : '') + formatMoney(p.value as number, currency),
        context: {
          csv: (r: MappedRow) => (r.line ? formatMoney(r.line.amount, currency) : ''),
        },
      },
      {
        headerName: 'Status',
        colId: 'status',
        flex: 1,
        minWidth: 170,
        valueGetter: (p) => (p.data ? this.statusText(p.data) : ''),
        cellClassRules: {
          'text-success-emphasis': (p) => !!p.data && this.statusOf(p.data).kind === 'new',
          'text-danger-emphasis': (p) => !!p.data && this.statusOf(p.data).kind === 'error',
          'text-body-secondary': (p) =>
            !!p.data && ['duplicate', 'skipped', 'unchecked'].includes(this.statusOf(p.data).kind),
        },
      },
    ];
  });

  /** What the server said about each readable line, by its file line. */
  private readonly serverStatus = computed(() => {
    const result = this.result();
    const readable = this.readable();
    const byLine = new Map<number, { status: string; error: string | null }>();
    result?.lines.forEach((l) => {
      const row = readable[l.index];
      if (row) {
        byLine.set(row.fileLine, { status: l.status, error: l.error });
      }
    });
    return byLine;
  });

  protected readonly blocker = computed(() => {
    if (this.unreadable().length && !this.skipUnreadable()) {
      return `${this.unreadable().length} lines can't be read — fix the column choices, or leave them out.`;
    }
    const r = this.result();
    if (r?.errors) {
      return 'Nothing is imported while any line has a problem — fix it (an archived account, a missing exchange rate, a day before the opening date) and check again.';
    }
    if (r && r.new === 0) {
      return 'Nothing new to import — every line is already in.';
    }
    return null;
  });

  protected readonly canImport = computed(() => !!this.result() && !this.blocker());

  protected statusOf(row: MappedRow): { kind: string; text?: string } {
    if (!row.line) {
      return { kind: this.skipUnreadable() ? 'skipped' : 'error', text: row.error ?? '' };
    }
    const server = this.serverStatus().get(row.fileLine);
    if (!server) {
      return { kind: 'unchecked' };
    }
    return server.status === 'New'
      ? { kind: 'new' }
      : server.status === 'Duplicate'
        ? { kind: 'duplicate' }
        : { kind: 'error', text: server.error ?? '' };
  }

  protected statusText(row: MappedRow): string {
    const status = this.statusOf(row);
    switch (status.kind) {
      case 'new':
        return 'New';
      case 'duplicate':
        return 'Already imported';
      case 'error':
        return status.text ?? 'A problem';
      case 'skipped':
        return `Left out — ${status.text}`;
      default:
        return 'Not checked yet';
    }
  }

  protected rawText(row: MappedRow): string {
    const cells = this.rows()[row.fileLine - 1] ?? [];
    return cells.filter((c) => c).join(' · ');
  }

  protected patch(change: Partial<StatementMapping>): void {
    this.mapping.update((m) => ({ ...m, ...change }));
    this.resetCheck();
  }

  /**
   * A different row holds the column names: guess the columns again from its names when they can be told (date
   * format and number style stay as chosen), otherwise keep the column choices and just move the start.
   */
  protected setHeaderRow(headerRow: number | null): void {
    const names = headerRow === null ? null : guessMapping(this.rows()[headerRow] ?? [], headerRow);
    if (!names || names.date === null) {
      this.patch({ headerRow });
      return;
    }
    const { dateFormat, decimalComma } = this.mapping();
    this.mapping.set({ ...names, dateFormat, decimalComma });
    this.resetCheck();
  }

  protected downloadSample(): void {
    // A byte-order mark so Excel opens it as UTF-8; the importer skips it.
    saveBlob(
      new Blob(['﻿' + SAMPLE_STATEMENT_CSV], { type: 'text/csv' }),
      'lifeos-statement-sample.csv',
    );
  }

  protected resetCheck(): void {
    this.result.set(null);
    this.accountError.set(false);
  }

  protected readFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.resetCheck();
    this.rows.set([]);
    this.fileError.set(null);
    this.fileName.set(file?.name ?? null);
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.fileError.set('That file is over 5 MB — export a shorter date range.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''));
      if (rows.length === 0) {
        this.fileError.set('That file has no rows.');
        return;
      }
      if (rows.length > MAX_LINES + 1) {
        this.fileError.set(`That's ${rows.length} rows — import at most ${MAX_LINES} at a time.`);
        return;
      }
      this.rows.set(rows);
      this.mapping.set(guessStatementMapping(rows));
    };
    reader.onerror = () => this.fileError.set('Could not read that file.');
    reader.readAsText(file);
  }

  private request(): { accountId: number; lines: NonNullable<MappedRow['line']>[] } | null {
    const accountId = this.accountId();
    if (accountId === null) {
      this.accountError.set(true);
      return null;
    }
    return { accountId, lines: this.readable().map((r) => r.line!) };
  }

  protected check(): void {
    const request = this.request();
    if (!request) {
      return;
    }
    if (request.lines.length === 0) {
      this.toast.error('No line could be read — check which column is the date and the amount.');
      return;
    }
    this.busy.set(true);
    this.financeService.previewImport(request.accountId, request.lines, this.tagIds()).subscribe({
      next: (result) => {
        this.result.set(result);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not check the statement.'));
      },
    });
  }

  protected import(): void {
    const request = this.request();
    if (!request) {
      return;
    }
    this.busy.set(true);
    this.financeService.importStatement(request.accountId, request.lines, this.tagIds()).subscribe({
      next: (result) => {
        this.busy.set(false);
        if (result.errors) {
          this.result.set(result);
          return;
        }
        const skipped = result.duplicates
          ? ` ${result.duplicates} already imported ${result.duplicates === 1 ? 'was' : 'were'} skipped.`
          : '';
        this.toast.success(
          `Imported ${result.added} ${result.added === 1 ? 'transaction' : 'transactions'}.${skipped}`,
        );
        void this.router.navigate(['/finance/transactions'], {
          queryParams: { accountId: request.accountId },
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not import the statement.'));
      },
    });
  }
}
