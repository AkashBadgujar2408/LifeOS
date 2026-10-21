import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ColDef } from 'ag-grid-community';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import { FamilyLogService, Interaction } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { interactionKind } from './family-log-view';
import { openInteractionEditor } from './interaction-editor';

/** Times in touch with anyone, newest first, in a data grid (search, sort, page, export). */
@Component({
  selector: 'app-family-interactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, DataGrid],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Times in touch</h1>
          <p class="text-body-secondary mb-0 small">
            Calls, visits and messages — each keeps "last in touch" up to date for everyone in it.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> Log time in touch
        </button>
      </div>

      @if (loadFailed() && !interactions()) {
        <app-load-error message="Couldn't load the times in touch." (retry)="load()" />
      } @else if (interactions(); as list) {
        @if (list.length === 0) {
          <p class="text-body-secondary">
            Nothing logged yet. After a call with your parents or a dinner with friends, log it here
            — with everyone who was there.
          </p>
        } @else {
          <input
            type="search"
            class="form-control mb-3"
            style="max-width: 24rem"
            placeholder="Search what or who"
            aria-label="Search times in touch"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
          <app-data-grid
            name="times-in-touch"
            [rows]="list"
            [columns]="columns"
            [phoneColumns]="['occurredOn', 'summary', 'people']"
            [search]="query()"
            [rowId]="rowId"
            [noun]="['time in touch', 'times in touch']"
            (open)="open($event)"
          />
          @if (list.length === take) {
            <p class="small text-body-secondary mt-2">Showing the latest {{ take }}.</p>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FamilyInteractions {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /** The server's most (InteractionsService.MaxTake). */
  protected readonly take = 500;
  protected readonly query = signal('');
  protected readonly rowId = (i: Interaction) => i.id;
  protected readonly columns: ColDef<Interaction>[] = [
    {
      headerName: 'Day',
      field: 'occurredOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'What',
      field: 'summary',
      flex: 1.5,
      minWidth: 150,
      valueGetter: (p) => (p.data ? p.data.summary || interactionKind(p.data.kind).label : ''),
    },
    {
      headerName: 'How',
      field: 'kind',
      width: 110,
      valueFormatter: (p) => (p.value ? interactionKind(p.value as Interaction['kind']).label : ''),
    },
    {
      headerName: 'With',
      colId: 'people',
      flex: 1.5,
      minWidth: 150,
      valueGetter: (p) => p.data?.people.map((x) => x.name).join(', ') ?? '',
    },
    { headerName: 'Notes', field: 'notes', flex: 1, minWidth: 150 },
  ];
  protected readonly interactions = signal<Interaction[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.familyLog
      .interactions(undefined, this.take)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.interactions.set(list);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(interaction?: Interaction): Promise<void> {
    const result = await openInteractionEditor(this.modal, interaction);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
      this.load();
    }
  }
}
