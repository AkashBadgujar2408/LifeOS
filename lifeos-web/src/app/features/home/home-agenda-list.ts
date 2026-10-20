import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  inject,
  input,
  output,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../core/services/api-error';
import { HomeAgendaItem, HomeService } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { AGENDA_ICONS, agendaStatus } from './home-view';
import { openBillEditor, openBillPay } from './bill-editor';
import { openMaintenanceDone, openMaintenanceEditor } from './maintenance-editor';
import { openVehicleEditor } from './vehicle-editor';
import { openWarrantyEditor } from './warranty-editor';

/**
 * "Coming up at home": warranties, PUCs and registrations running out and maintenance due, soonest first. Each line
 * opens its item; maintenance can be marked done and bills paid right here. Emits `changed` after anything was saved, so the host
 * reloads.
 */
@Component({
  selector: 'app-home-agenda-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
      @for (item of items(); track item.kind + item.entityId) {
        @let status = statusOf(item);
        <li class="d-flex flex-wrap align-items-center gap-2">
          <i class="bi {{ icons[item.kind] }} text-body-secondary" aria-hidden="true"></i>
          <button
            type="button"
            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break me-auto"
            (click)="open(item)"
          >
            {{ item.title }}
          </button>
          <span
            class="small"
            [class.text-danger-emphasis]="status.state === 'past'"
            [class.fw-semibold]="status.state !== 'past'"
          >
            @if (status.state === 'past') {
              <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
            }
            {{ status.label }}
          </span>
          <span class="small text-body-secondary">{{ item.on | date }}</span>
          @if (item.kind === 'Maintenance') {
            <button type="button" class="btn btn-outline-primary btn-sm" (click)="done(item)">
              <i class="bi bi-check2" aria-hidden="true"></i> Done
            </button>
          } @else if (item.kind === 'Bill') {
            <button type="button" class="btn btn-outline-primary btn-sm" (click)="pay(item)">
              Pay
            </button>
          }
        </li>
      }
    </ul>
  `,
})
export class HomeAgendaList {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);

  readonly items = input.required<HomeAgendaItem[]>();
  readonly today = input.required<string>();
  readonly changed = output<void>();

  protected readonly icons = AGENDA_ICONS;

  protected statusOf(item: HomeAgendaItem) {
    return agendaStatus(item, this.today());
  }

  protected open(item: HomeAgendaItem): void {
    const failed = (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not open it.'));
    switch (item.entityType) {
      case 'Warranty':
        this.homeService.warranty(item.entityId).subscribe({
          next: async (warranty) => this.after(await openWarrantyEditor(this.modal, warranty)),
          error: failed,
        });
        break;
      case 'Vehicle':
        this.homeService.vehicle(item.entityId).subscribe({
          next: async (vehicle) => this.after(await openVehicleEditor(this.modal, vehicle)),
          error: failed,
        });
        break;
      case 'MaintenanceTask':
        this.homeService.maintenanceTask(item.entityId).subscribe({
          next: async (task) => this.after(await openMaintenanceEditor(this.modal, task)),
          error: failed,
        });
        break;
      case 'UtilityBill':
        this.homeService.bill(item.entityId).subscribe({
          next: async (bill) => this.after(await openBillEditor(this.modal, bill)),
          error: failed,
        });
        break;
    }
  }

  protected done(item: HomeAgendaItem): void {
    this.homeService.maintenanceTask(item.entityId).subscribe({
      next: async (task) => {
        const updated = await openMaintenanceDone(this.modal, task, task.targetType === 'Vehicle');
        if (updated) {
          this.toast.success(
            `Done — next due ${formatDate(updated.nextDueOn, APP_DATE_FORMAT, this.locale)}.`,
          );
          this.changed.emit();
        }
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open it.')),
    });
  }

  protected pay(item: HomeAgendaItem): void {
    this.homeService.bill(item.entityId).subscribe({
      next: async (bill) => {
        const paid = await openBillPay(this.modal, bill);
        if (paid) {
          this.toast.success(paid.transactionId ? 'Paid — recorded in Finance.' : 'Marked paid.');
          this.changed.emit();
        }
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open it.')),
    });
  }

  private after(result: { kind: 'saved' | 'deleted' } | null): void {
    // Reload even on dismiss: links and reminders added in the editor apply immediately.
    this.changed.emit();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
    }
  }
}
