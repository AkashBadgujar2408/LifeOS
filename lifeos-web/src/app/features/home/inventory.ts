import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { Asset, HomeService, Property } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openAssetEditor } from './asset-editor';
import { RoomGroup, filterAssets, groupByRoom, runsOutStatus } from './home-view';
import { openWarrantyEditor } from './warranty-editor';

/** Everything you own, by property and room; search and categories (tags) narrow it down. */
@Component({
  selector: 'app-home-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, LoadError],
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
        @if (assets.length === 0) {
          <p class="text-body-secondary">
            Nothing in your inventory yet. Start with the things you'd need to claim for — the
            fridge, the laptop, the TV — and add their bills and warranties.
          </p>
        } @else {
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
          <p class="small text-body-secondary">
            {{ shownCount() }} {{ shownCount() === 1 ? 'thing' : 'things' }}
            @if (shownValue().length) {
              · bought for
              @for (v of shownValue(); track v.currency; let last = $last) {
                {{ money(v.total, v.currency) }}{{ last ? '' : ' + ' }}
              }
            }
          </p>
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
                      <div class="small text-end">
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

  /** ?propertyId= from the overview's "N things" link. */
  readonly propertyId = input<string | undefined>();

  protected readonly money = formatMoney;
  protected readonly isSet = (value: string | null): value is string => !!value;
  protected readonly assets = signal<Asset[] | null>(null);
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

  private readonly shown = computed(() => {
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
    forkJoin({ assets: this.homeService.assets(), properties: this.homeService.properties() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ assets, properties }) => {
          this.assets.set(assets);
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
}
