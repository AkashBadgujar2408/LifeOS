import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ColDef } from 'ag-grid-community';
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { GridView, ViewToggle } from '../../core/grid/view-toggle';
import { Asset, HomeService, Property } from '../../core/services/home.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openAssetEditor } from './asset-editor';
import { openDisposal, takeBack } from './disposal-dialog';
import {
  DISPOSAL_KIND_LABELS,
  RoomGroup,
  filterAssets,
  groupByRoom,
  runsOutStatus,
} from './home-view';
import { openWarrantyEditor } from './warranty-editor';

/**
 * Everything you own, by property and room — or as one table (Session 75a) to sort, page and export; search,
 * property and categories (tags) narrow both down.
 */
@Component({
  selector: 'app-home-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, LoadError, DataGrid, ViewToggle],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Inventory</h1>
          <p class="text-body-secondary mb-0 small">
            What you own and where it is — with its bill, photos and warranty one click away.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add item
        </button>
      </div>

      @if (loadFailed() && !assets()) {
        <app-load-error message="Couldn't load your inventory." (retry)="load()" />
      } @else if (assets(); as assets) {
        @if (assets.length === 0 && letGoItems().length === 0) {
          <p class="text-body-secondary">
            Nothing in your inventory yet. Start with the things you'd need to claim for — the
            fridge, the laptop, the TV — and add their bills and warranties.
          </p>
        } @else if (assets.length) {
          <div class="row g-2 mb-3">
            <div class="col-sm-6 col-lg-5">
              <input
                type="search"
                class="form-control"
                placeholder="Search name, brand, serial number, room…"
                aria-label="Search the inventory"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
              />
            </div>
            <div class="col-6 col-sm-3">
              <select
                class="form-select"
                aria-label="Property"
                [ngModel]="propertyFilter()"
                (ngModelChange)="propertyFilter.set($event)"
              >
                <option [ngValue]="null" [selected]="propertyFilter() === null">
                  Every property
                </option>
                @for (p of properties(); track p.id) {
                  <option [ngValue]="p.id" [selected]="p.id === propertyFilter()">
                    {{ p.name }}
                  </option>
                }
              </select>
            </div>
            <div class="col-6 col-sm-3">
              <select
                class="form-select"
                aria-label="Category"
                [ngModel]="tagFilter()"
                (ngModelChange)="tagFilter.set($event)"
              >
                <option [ngValue]="null" [selected]="tagFilter() === null">Every category</option>
                @for (t of tags(); track t.id) {
                  <option [ngValue]="t.id" [selected]="t.id === tagFilter()">{{ t.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <p class="small text-body-secondary mb-0">
              {{ shownCount() }} {{ shownCount() === 1 ? 'thing' : 'things' }}
              @if (shownValue().length) {
                · bought for
                @for (v of shownValue(); track v.currency; let last = $last) {
                  {{ money(v.total, v.currency) }}{{ last ? '' : ' + ' }}
                }
              }
            </p>
            <app-view-toggle
              key="inventory"
              label="Show the inventory"
              cardsLabel="By room"
              cardsIcon="bi-door-open"
              [(view)]="view"
            />
          </div>
          @if (view() === 'table') {
            @if (shown().length) {
              <app-data-grid
                name="inventory"
                [rows]="shown()"
                [columns]="columns"
                [phoneColumns]="['name', 'room', 'purchasePrice']"
                [rowId]="rowId"
                [noun]="['item', 'items']"
                (open)="edit($event)"
              />
            } @else {
              <p class="text-body-secondary">Nothing matches.</p>
            }
          } @else {
            @for (group of groups(); track group.key) {
              <section class="card mb-3" [attr.aria-label]="groupLabel(group)">
                <div class="card-header d-flex align-items-center gap-2 bg-transparent">
                  <h2 class="h6 mb-0 me-auto">
                    {{ group.room ?? 'No room' }}
                    @if (group.propertyName) {
                      <span class="text-body-secondary fw-normal"> · {{ group.propertyName }}</span>
                    }
                  </h2>
                  <span class="small text-body-secondary">{{ group.count }}</span>
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0"
                    [attr.aria-label]="'Add an item to ' + groupLabel(group)"
                    (click)="addTo(group)"
                  >
                    <i class="bi bi-plus-lg"></i>
                  </button>
                </div>
                <ul class="list-group list-group-flush">
                  @for (a of group.assets; track a.id) {
                    <li class="list-group-item">
                      <div class="d-flex flex-wrap gap-2 align-items-start">
                        <div class="min-w-0 flex-grow-1">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                            (click)="edit(a)"
                          >
                            {{ a.name }}
                            @if (a.quantity > 1) {
                              <span class="text-body-secondary fw-normal">× {{ a.quantity }}</span>
                            }
                          </button>
                          <div class="small text-body-secondary text-break">
                            @if (a.brand || a.model) {
                              {{ [a.brand, a.model].filter(isSet).join(' ') }}
                            }
                            @if (a.purchasedOn) {
                              · bought {{ a.purchasedOn | date }}
                            }
                            @if (a.purchasePrice !== null && a.currency) {
                              · {{ money(a.purchasePrice, a.currency) }}
                            }
                            @for (t of a.tags; track t.id) {
                              <span class="badge text-bg-light border ms-1">{{ t.name }}</span>
                            }
                          </div>
                        </div>
                        <div class="small text-end d-flex flex-column align-items-end gap-1">
                          @if (a.coveredUntil; as until) {
                            @let status = runsOut(until);
                            <span
                              [class.text-danger-emphasis]="status.state === 'past'"
                              [class.fw-semibold]="
                                status.state === 'soon' || status.state === 'today'
                              "
                            >
                              <i class="bi bi-patch-check" aria-hidden="true"></i>
                              @if (status.state === 'past') {
                                Cover ran out {{ until | date }}
                              } @else {
                                Covered until {{ until | date }}
                              }
                            </span>
                          } @else {
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 link-secondary"
                              (click)="addWarranty(a)"
                            >
                              Add warranty
                            </button>
                          }
                          <button
                            type="button"
                            class="btn btn-link btn-sm p-0 link-secondary"
                            (click)="letGo(a)"
                          >
                            Let go…
                          </button>
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              </section>
            } @empty {
              <p class="text-body-secondary">Nothing matches.</p>
            }
          }
        }
        @if (letGoItems().length) {
          <section class="mt-4" aria-labelledby="inventory-let-go">
            <button
              type="button"
              class="btn btn-link p-0 text-decoration-none"
              id="inventory-let-go"
              [attr.aria-expanded]="showLetGo()"
              (click)="showLetGo.set(!showLetGo())"
            >
              <i
                class="bi"
                [class.bi-chevron-down]="showLetGo()"
                [class.bi-chevron-right]="!showLetGo()"
              ></i>
              {{ letGoItems().length }} {{ letGoItems().length === 1 ? 'thing' : 'things' }} you've
              let go
            </button>
            @if (showLetGo()) {
              <div class="card mt-2">
                <ul class="list-group list-group-flush">
                  @for (a of letGoItems(); track a.id) {
                    <li class="list-group-item text-body-secondary">
                      <div class="d-flex flex-wrap gap-2 align-items-center">
                        <button
                          type="button"
                          class="btn btn-link p-0 link-body-emphasis text-decoration-none text-start text-break me-auto"
                          (click)="edit(a)"
                        >
                          {{ a.name }}
                        </button>
                        <span class="small">
                          {{ disposalLabels[a.disposalKind!] }} {{ a.disposedOn | date }}
                          @if (a.disposalAmount !== null && a.currency) {
                            for {{ money(a.disposalAmount, a.currency) }}
                          }
                        </span>
                        <button type="button" class="btn btn-link btn-sm p-0" (click)="takeBack(a)">
                          Take back
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }
          </section>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeInventory implements OnInit {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /** ?propertyId= from the overview's "N things" link. */
  readonly propertyId = input<string | undefined>();

  protected readonly money = formatMoney;
  protected readonly isSet = (value: string | null): value is string => !!value;
  /** Everything, let go or not (null until loaded). */
  private readonly all = signal<Asset[] | null>(null);
  /** The inventory: what you still have. */
  protected readonly assets = computed(() => this.all()?.filter((a) => !a.disposedOn) ?? null);
  /** What you've let go, most recent first. */
  protected readonly letGoItems = computed(() =>
    (this.all() ?? [])
      .filter((a) => a.disposedOn)
      .sort((a, b) => b.disposedOn!.localeCompare(a.disposedOn!)),
  );
  protected readonly showLetGo = signal(false);
  protected readonly disposalLabels = DISPOSAL_KIND_LABELS;
  protected readonly properties = signal<Property[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly search = signal('');
  protected readonly tagFilter = signal<number | null>(null);
  protected readonly propertyFilter = signal<number | null>(null);
  private readonly today = todayIso();

  /** Categories in use, A–Z. */
  protected readonly tags = computed(() => {
    const seen = new Map<number, string>();
    for (const asset of this.assets() ?? []) {
      for (const tag of asset.tags) {
        seen.set(tag.id, tag.name);
      }
    }
    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** By room (cards) or one table; the toggle remembers it on this device. */
  protected readonly view = signal<GridView>('cards');
  protected readonly rowId = (a: Asset) => a.id;
  protected readonly columns: ColDef<Asset>[] = [
    { headerName: 'Item', field: 'name', flex: 2, minWidth: 160, sort: 'asc' },
    { headerName: 'Qty', field: 'quantity', width: 80, type: 'rightAligned' },
    { headerName: 'Room', field: 'room', flex: 1, minWidth: 110 },
    { headerName: 'Property', field: 'propertyName', flex: 1, minWidth: 120 },
    {
      headerName: 'Brand & model',
      colId: 'brandModel',
      flex: 1,
      minWidth: 140,
      valueGetter: (p) => (p.data ? [p.data.brand, p.data.model].filter(Boolean).join(' ') : ''),
    },
    { headerName: 'Serial number', field: 'serialNumber', width: 150 },
    {
      headerName: 'Bought',
      field: 'purchasedOn',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'Price',
      field: 'purchasePrice',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) =>
        p.data && p.data.purchasePrice !== null && p.data.currency
          ? formatMoney(p.data.purchasePrice, p.data.currency)
          : '',
    },
    {
      headerName: 'Covered until',
      field: 'coveredUntil',
      width: 135,
      valueFormatter: dayFormatter(this.locale),
    },
    {
      headerName: 'Categories',
      colId: 'tags',
      flex: 1,
      minWidth: 120,
      valueGetter: (p) => p.data?.tags.map((t) => t.name).join(', ') ?? '',
    },
  ];

  protected readonly shown = computed(() => {
    const property = this.propertyFilter();
    return filterAssets(this.assets() ?? [], this.search(), this.tagFilter()).filter(
      (a) => property === null || a.propertyId === property,
    );
  });

  protected readonly groups = computed(() => groupByRoom(this.shown()));
  protected readonly shownCount = computed(() =>
    this.shown().reduce((sum, a) => sum + a.quantity, 0),
  );

  /** What the shown things cost, per currency. */
  protected readonly shownValue = computed(() => {
    const totals = new Map<string, number>();
    for (const a of this.shown()) {
      if (a.purchasePrice !== null && a.currency) {
        totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.purchasePrice);
      }
    }
    return [...totals].map(([currency, total]) => ({ currency, total }));
  });

  constructor() {
    this.load();
  }

  ngOnInit(): void {
    const id = Number(this.propertyId());
    if (Number.isInteger(id) && id > 0) {
      this.propertyFilter.set(id);
    }
  }

  protected load(): void {
    forkJoin({ assets: this.homeService.assets(true), properties: this.homeService.properties() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ assets, properties }) => {
          this.all.set(assets);
          this.properties.set(properties);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected runsOut(day: string) {
    return runsOutStatus(day, this.today);
  }

  protected groupLabel(group: RoomGroup): string {
    return [group.room ?? 'No room', group.propertyName].filter(Boolean).join(', ');
  }

  protected addTo(group: RoomGroup): void {
    void this.edit(undefined, group);
  }

  protected async edit(asset?: Asset, group?: RoomGroup): Promise<void> {
    const result = await openAssetEditor(this.modal, asset, {
      propertyId: group ? (group.assets[0]?.propertyId ?? null) : this.propertyFilter(),
      room: group?.room ?? null,
    });
    // Reload even on dismiss: photos, links and reminders added in the editor apply immediately.
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
    }
  }

  protected async addWarranty(asset: Asset): Promise<void> {
    const result = await openWarrantyEditor(this.modal, undefined, { type: 'Asset', id: asset.id });
    if (result) {
      this.load();
      this.toast.success('Warranty saved.');
    }
  }

  protected async letGo(asset: Asset): Promise<void> {
    const done = await openDisposal(this.modal, {
      type: 'Asset',
      id: asset.id,
      name: asset.name,
      currency: asset.currency,
      purchasedOn: asset.purchasedOn,
    });
    if (done) {
      this.load();
      this.toast.success(`${asset.name} is out of the inventory — kept in your history.`);
    }
  }

  protected takeBack(asset: Asset): void {
    takeBack(this.homeService, 'Asset', asset.id).subscribe({
      next: () => {
        this.load();
        this.toast.success(`${asset.name} is back in the inventory.`);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take it back.')),
    });
  }
}
