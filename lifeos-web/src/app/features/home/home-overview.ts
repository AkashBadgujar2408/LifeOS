import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { HomeAgendaItem, HomeService, Property } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { HomeAgendaList } from './home-agenda-list';
import { OWNERSHIP_LABELS, PROPERTY_KIND_ICONS, PROPERTY_KIND_LABELS } from './home-view';
import { openPropertyEditor } from './property-editor';

interface HomeCounts {
  assets: number;
  vehicles: number;
  warranties: number;
  maintenance: number;
}

/** Home & assets at a glance: what needs attention soon, your properties, and the way into each list. */
@Component({
  selector: 'app-home-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, HomeAgendaList],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Home &amp; assets</h1>
          <p class="text-body-secondary mb-0 small">
            Where you live, what you own and what keeps it all running.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="editProperty()">
          <i class="bi bi-plus-lg"></i> Add property
        </button>
      </div>

      @if (loadFailed() && !properties()) {
        <app-load-error message="Couldn't load your home." (retry)="load()" />
      } @else if (properties(); as properties) {
        <div class="row g-3 mb-4">
          @for (link of links(); track link.route) {
            <div class="col-6 col-lg-3">
              <a
                [routerLink]="link.route"
                class="card h-100 text-decoration-none link-body-emphasis"
              >
                <div class="card-body">
                  <i class="bi {{ link.icon }} text-body-secondary" aria-hidden="true"></i>
                  <div class="h4 mb-0 mt-1">{{ link.count }}</div>
                  <div class="small text-body-secondary">{{ link.label }}</div>
                </div>
              </a>
            </div>
          }
        </div>

        <section class="card mb-4" aria-labelledby="home-coming-up">
          <div class="card-body p-4">
            <h2 id="home-coming-up" class="h5 mb-3">Coming up</h2>
            @if (agenda().length === 0) {
              <p class="text-body-secondary mb-0 small">
                Nothing running out or due in the next few weeks.
              </p>
            } @else {
              <app-home-agenda-list [items]="agenda()" [today]="today" (changed)="load()" />
            }
          </div>
        </section>

        <section aria-labelledby="home-properties">
          <h2 id="home-properties" class="h5 mb-3">Properties</h2>
          @if (properties.length === 0) {
            <p class="text-body-secondary">
              No properties yet. Add where you live to group your belongings by room, and keep the
              deed or rent agreement one click away.
            </p>
          } @else {
            <div class="card">
              <ul class="list-group list-group-flush">
                @for (p of properties; track p.id) {
                  <li class="list-group-item py-3" [class.text-body-secondary]="p.movedOutOn">
                    <div class="d-flex gap-3 align-items-start">
                      <i class="bi mt-1 {{ kindIcons[p.kind] }}" aria-hidden="true"></i>
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                          (click)="editProperty(p)"
                        >
                          {{ p.name }}
                        </button>
                        <div class="small text-body-secondary">
                          {{ kindLabels[p.kind] }} · {{ ownershipLabels[p.ownership] }}
                          @if (p.movedOutOn) {
                            · moved out {{ p.movedOutOn | date }}
                          } @else if (p.movedInOn) {
                            · since {{ p.movedInOn | date }}
                          }
                          @if (p.purchasePrice !== null && p.currency) {
                            · bought for {{ money(p.purchasePrice, p.currency) }}
                          }
                        </div>
                        @if (p.address) {
                          <div class="small text-break">{{ p.address }}</div>
                        }
                      </div>
                      <a
                        routerLink="/home/inventory"
                        [queryParams]="{ propertyId: p.id }"
                        class="small text-nowrap"
                      >
                        {{ p.assetCount }} {{ p.assetCount === 1 ? 'thing' : 'things' }}
                      </a>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }
        </section>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeOverview {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindLabels = PROPERTY_KIND_LABELS;
  protected readonly kindIcons = PROPERTY_KIND_ICONS;
  protected readonly ownershipLabels = OWNERSHIP_LABELS;
  protected readonly money = formatMoney;
  protected readonly today = todayIso();
  protected readonly properties = signal<Property[] | null>(null);
  protected readonly agenda = signal<HomeAgendaItem[]>([]);
  protected readonly counts = signal<HomeCounts>({
    assets: 0,
    vehicles: 0,
    warranties: 0,
    maintenance: 0,
  });
  protected readonly loadFailed = signal(false);

  protected readonly links = computed(() => {
    const c = this.counts();
    return [
      { route: '/home/inventory', icon: 'bi-box-seam', label: 'Things you own', count: c.assets },
      { route: '/home/vehicles', icon: 'bi-car-front', label: 'Vehicles', count: c.vehicles },
      {
        route: '/home/warranties',
        icon: 'bi-patch-check',
        label: 'Warranties & AMCs',
        count: c.warranties,
      },
      { route: '/home/maintenance', icon: 'bi-tools', label: 'Maintenance', count: c.maintenance },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    forkJoin({
      properties: this.homeService.properties(),
      agenda: this.homeService.agenda(this.today),
      assets: this.homeService.assets(),
      vehicles: this.homeService.vehicles(),
      warranties: this.homeService.warranties(),
      maintenance: this.homeService.maintenance(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.properties.set(r.properties);
          this.agenda.set(r.agenda);
          this.counts.set({
            assets: r.assets.reduce((sum, a) => sum + a.quantity, 0),
            vehicles: r.vehicles.filter((v) => !v.disposedOn).length,
            warranties: r.warranties.filter((w) => w.expiresOn >= this.today && !w.coverDisposed)
              .length,
            maintenance: r.maintenance.filter((m) => !m.isPaused).length,
          });
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async editProperty(property?: Property): Promise<void> {
    const result = await openPropertyEditor(this.modal, property);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Property saved.' : 'Property deleted.');
    }
  }
}
