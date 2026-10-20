import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HomeService, Vehicle } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openDisposal, takeBack } from './disposal-dialog';
import { DISPOSAL_KIND_LABELS, VEHICLE_KIND_ICONS, dueStatus, runsOutStatus } from './home-view';
import { openMaintenanceDone, openMaintenanceEditor } from './maintenance-editor';
import { openVehicleEditor } from './vehicle-editor';

interface PaperLine {
  label: string;
  on: string | null;
}

/** Your vehicles: insurance, PUC and registration with how long each has left, the odometer and the next service. */
@Component({
  selector: 'app-home-vehicles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Vehicles</h1>
          <p class="text-body-secondary mb-0 small">
            Papers that run out, and servicing that comes round again.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add vehicle
        </button>
      </div>

      @if (loadFailed() && !vehicles()) {
        <app-load-error message="Couldn't load your vehicles." (retry)="load()" />
      } @else if (vehicles(); as vehicles) {
        @if (vehicles.length === 0) {
          <p class="text-body-secondary">
            No vehicles yet. Add one to be reminded before its PUC or registration runs out, and to
            keep its servicing on schedule.
          </p>
        } @else {
          <div class="row g-3">
            @for (v of vehicles; track v.id) {
              <div class="col-lg-6">
                <section class="card h-100" [class.text-body-secondary]="v.disposedOn">
                  <div class="card-body">
                    <div class="d-flex gap-3 align-items-start mb-3">
                      <i class="bi fs-4 {{ kindIcons[v.kind] }}" aria-hidden="true"></i>
                      <div class="min-w-0 flex-grow-1">
                        <h2 class="h5 mb-0">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break fs-5"
                            (click)="edit(v)"
                          >
                            {{ v.name }}
                          </button>
                        </h2>
                        <div class="small text-body-secondary text-break">
                          {{ describe(v) }}
                          @if (v.registrationNumber) {
                            · <span class="font-monospace">{{ v.registrationNumber }}</span>
                          }
                        </div>
                      </div>
                      @if (v.odometerKm !== null) {
                        <div class="text-end small">
                          <div class="fw-semibold">{{ v.odometerKm | number }} km</div>
                          <div class="text-body-secondary">last logged</div>
                        </div>
                      }
                    </div>
                    @if (v.disposedOn) {
                      <p class="small mb-0">
                        {{ disposalLabels[v.disposalKind!] }} on {{ v.disposedOn | date }}
                        @if (v.disposalAmount !== null && v.currency) {
                          for {{ money(v.disposalAmount, v.currency) }}
                        }
                        — kept in your history.
                        <button
                          type="button"
                          class="btn btn-link btn-sm p-0 align-baseline"
                          (click)="takeBack(v)"
                        >
                          Take back
                        </button>
                      </p>
                    } @else {
                      <dl class="row small mb-0 g-1">
                        @for (paper of papers(v); track paper.label) {
                          <dt class="col-5 fw-normal text-body-secondary">{{ paper.label }}</dt>
                          <dd class="col-7 mb-0">
                            @if (paper.on; as on) {
                              @let status = runsOut(on);
                              <span
                                [class.text-danger-emphasis]="status.state === 'past'"
                                [class.fw-semibold]="
                                  status.state === 'soon' || status.state === 'today'
                                "
                              >
                                {{ on | date }}
                                @if (status.state !== 'later') {
                                  <span class="d-block d-sm-inline">({{ status.label }})</span>
                                }
                              </span>
                            } @else {
                              <span class="text-body-secondary">—</span>
                            }
                          </dd>
                        }
                        <dt class="col-5 fw-normal text-body-secondary">Next service</dt>
                        <dd class="col-7 mb-0">
                          @if (v.nextServiceOn; as on) {
                            @let due = dueOf(on);
                            <span
                              [class.text-danger-emphasis]="due.state === 'past'"
                              [class.fw-semibold]="due.state === 'soon' || due.state === 'today'"
                            >
                              {{ on | date }}
                              @if (due.state !== 'later') {
                                ({{ due.label }})
                              }
                            </span>
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 ms-1 align-baseline"
                              (click)="serviced(v)"
                            >
                              Done
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 align-baseline"
                              (click)="planService(v)"
                            >
                              Plan servicing
                            </button>
                          }
                        </dd>
                      </dl>
                      @if (v.reminderDays !== null) {
                        <p class="small text-body-secondary mb-0 mt-2">
                          <i class="bi bi-bell" aria-hidden="true"></i>
                          PUC and registration reminded {{ v.reminderDays }} days before.
                        </p>
                      }
                      <button
                        type="button"
                        class="btn btn-link btn-sm p-0 mt-2 link-secondary"
                        (click)="letGo(v)"
                      >
                        Sold it, or let it go…
                      </button>
                    }
                  </div>
                </section>
              </div>
            }
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeVehicles {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindIcons = VEHICLE_KIND_ICONS;
  protected readonly disposalLabels = DISPOSAL_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly vehicles = signal<Vehicle[] | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  constructor() {
    this.load();
  }

  protected load(): void {
    this.homeService
      .vehicles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vehicles) => {
          this.vehicles.set(vehicles);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected describe(v: Vehicle): string {
    return [v.make, v.model, v.modelYear?.toString()].filter(Boolean).join(' ') || v.kind;
  }

  protected papers(v: Vehicle): PaperLine[] {
    return [
      {
        label: v.insurancePolicyName ? `Insurance (${v.insurancePolicyName})` : 'Insurance',
        on: v.insuranceRenewsOn ?? v.insuranceEndsOn,
      },
      { label: 'PUC', on: v.pucValidUntil },
      { label: 'Registration', on: v.registrationValidUntil },
    ];
  }

  protected runsOut(day: string) {
    return runsOutStatus(day, this.today);
  }

  protected dueOf(day: string) {
    return dueStatus(day, this.today);
  }

  protected async edit(vehicle?: Vehicle): Promise<void> {
    const result = await openVehicleEditor(this.modal, vehicle);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Vehicle saved.' : 'Vehicle deleted.');
    }
  }

  protected serviced(vehicle: Vehicle): void {
    if (vehicle.nextServiceTaskId === null) {
      return;
    }
    this.homeService.maintenanceTask(vehicle.nextServiceTaskId).subscribe({
      next: async (task) => {
        if (await openMaintenanceDone(this.modal, task, true)) {
          this.load();
          this.toast.success('Done — the next one is scheduled.');
        }
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the servicing.')),
    });
  }

  protected async planService(vehicle: Vehicle): Promise<void> {
    const result = await openMaintenanceEditor(this.modal, undefined, {
      type: 'Vehicle',
      id: vehicle.id,
    });
    if (result) {
      this.load();
      this.toast.success('Servicing planned.');
    }
  }

  protected async letGo(vehicle: Vehicle): Promise<void> {
    const done = await openDisposal(this.modal, {
      type: 'Vehicle',
      id: vehicle.id,
      name: vehicle.name,
      currency: vehicle.currency,
      purchasedOn: vehicle.purchasedOn,
    });
    if (done) {
      this.load();
      this.toast.success(`${vehicle.name} is kept in your history; its reminders have stopped.`);
    }
  }

  protected takeBack(vehicle: Vehicle): void {
    takeBack(this.homeService, 'Vehicle', vehicle.id).subscribe({
      next: () => {
        this.load();
        this.toast.success(`${vehicle.name} is back — its reminders are on again.`);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take it back.')),
    });
  }
}
