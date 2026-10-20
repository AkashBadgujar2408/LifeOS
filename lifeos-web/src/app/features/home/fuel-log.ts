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
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { itemTitle } from '../../core/layout/item-title';
import { FuelFill, FuelHistory, HomeService, Vehicle } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openFuelFill } from './fuel-fill-editor';
import { FUEL_UNIT_SHORT, fuelTrendByFill, mileageLine, mileageText } from './home-view';

/**
 * A vehicle's fuel log: every fill (newest first) with the average as it stood after it, the overall average of the
 * current run, and what fuel cost per month. Everything here is computed on the server by FuelEconomy.
 */
@Component({
  selector: 'app-home-fuel-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <nav aria-label="breadcrumb" class="small mb-2">
        <a routerLink="/home/vehicles">Vehicles</a>
      </nav>
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div class="min-w-0">
          <h1 class="h3 mb-1 text-break">Fuel — {{ vehicle()?.name ?? '…' }}</h1>
          <p class="text-body-secondary mb-0 small">
            Mileage is one overall average: distance ÷ the fuel of every fill but the latest (that
            fuel is still in the tank). It settles as fills add up.
          </p>
        </div>
        <button type="button" class="btn btn-primary" [disabled]="!vehicle()" (click)="edit()">
          <i class="bi bi-fuel-pump"></i> Add fill
        </button>
      </div>

      @if (loadFailed() && !history()) {
        <app-load-error message="Couldn't load the fuel log." (retry)="load()" />
      } @else if (history(); as h) {
        <section class="card mb-4" aria-labelledby="fuel-average">
          <div class="card-body">
            <h2 id="fuel-average" class="h6 text-body-secondary mb-1">Average (an estimate)</h2>
            @if (h.average; as a) {
              <p class="fs-4 fw-semibold mb-1">{{ text(a.perUnit) }}</p>
              <p class="small text-body-secondary mb-0">
                {{ a.distanceKm | number }} km on {{ a.fuelUsed | number: '1.0-2' }}
                {{ unit() }} over {{ a.fills }} fills
                @if (a.costPerKm !== null && a.currency) {
                  · {{ money(a.costPerKm, a.currency) }}/km
                }
              </p>
            } @else {
              <p class="mb-0">{{ line() }}</p>
            }
          </div>
        </section>

        @if (h.fills.length === 0) {
          <p class="text-body-secondary">
            No fills yet. Log each fill with the odometer reading — two are enough for a first
            average.
          </p>
        } @else {
          <section class="mb-4" aria-labelledby="fuel-fills">
            <h2 id="fuel-fills" class="h5 mb-3">Fills</h2>
            <div class="card">
              <ul class="list-group list-group-flush">
                @for (f of h.fills; track f.id) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap gap-2 align-items-start">
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start"
                          (click)="edit(f)"
                        >
                          {{ f.filledOn | date }} · {{ f.odometerKm | number }} km
                        </button>
                        <div class="small text-body-secondary">
                          {{ f.quantity | number: '1.0-2' }} {{ unit() }} at
                          {{ money(f.pricePerUnit, f.currency) }}/{{ unit() }}
                          @if (f.transactionId) {
                            · <i class="bi bi-check2-circle" aria-hidden="true"></i> in Finance
                          }
                          @if (f.missedFillBefore) {
                            · <span class="fst-italic">average restarted</span>
                          }
                          @if (f.notes) {
                            · <span class="text-break">{{ f.notes }}</span>
                          }
                        </div>
                      </div>
                      <div class="text-end small">
                        <div class="fw-semibold">{{ money(f.amount, f.currency) }}</div>
                        @if (trend().get(f.id); as perUnit) {
                          <div class="text-body-secondary">avg {{ text(perUnit) }}</div>
                        }
                      </div>
                    </div>
                  </li>
                }
              </ul>
            </div>
          </section>

          @if (h.monthly.length) {
            <section class="card" aria-labelledby="fuel-months">
              <div class="card-body">
                <h2 id="fuel-months" class="h6 mb-3">Spent on fuel</h2>
                <table class="table table-sm mb-0 small">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" class="text-end">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of h.monthly.slice(0, 12); track m.monthStart + m.currency) {
                      <tr>
                        <td>{{ m.monthStart | date: 'MMM yyyy' }}</td>
                        <td class="text-end">{{ money(m.amount, m.currency) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeFuelLog {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter (`/home/vehicles/:id/fuel`). */
  readonly id = input.required<string>();

  protected readonly money = formatMoney;
  protected readonly vehicle = signal<Vehicle | null>(null);
  protected readonly history = signal<FuelHistory | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly unit = computed(() => FUEL_UNIT_SHORT[this.history()?.fuelUnit ?? 'Litre']);
  protected readonly trend = computed(() => fuelTrendByFill(this.history()?.trend ?? []));
  protected readonly line = computed(() => {
    const v = this.vehicle();
    return v ? mileageLine(v) : '';
  });

  constructor() {
    itemTitle(() => (this.vehicle() ? `Fuel — ${this.vehicle()!.name}` : null));
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const id = Number(this.id());
    forkJoin([this.homeService.vehicle(id), this.homeService.fuelHistory(id)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([vehicle, history]) => {
          this.vehicle.set(vehicle);
          this.history.set(history);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected text(perUnit: number): string {
    return mileageText(perUnit, this.history()?.fuelUnit ?? 'Litre');
  }

  protected async edit(fill?: FuelFill): Promise<void> {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return;
    }
    const last = this.history()?.fills[0];
    const result = await openFuelFill(
      this.modal,
      {
        id: vehicle.id,
        name: vehicle.name,
        fuelUnit: vehicle.fuelUnit,
        odometerKm: vehicle.odometerKm,
        currency: last?.currency ?? null,
      },
      fill,
    );
    if (result) {
      this.load();
      this.toast.success(result.kind === 'saved' ? 'Fill saved.' : 'Fill deleted.');
    }
  }
}
