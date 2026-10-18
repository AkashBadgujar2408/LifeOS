import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../core/services/api-error';
import { DashboardService, KpiDefinition } from '../../core/services/dashboard.service';
import { ToastService } from '../../core/services/toast.service';
import { moveKey } from './kpi-view';

const MAX_TILES = 6;

/**
 * Opens the KPI picker over the figures on offer (already without hidden modules) and the current choice. Resolves
 * with the saved keys, or null if it was closed without saving.
 */
export async function openKpiPicker(
  modal: NgbModal,
  available: readonly KpiDefinition[],
  chosen: readonly string[],
  keep: readonly string[] = [],
): Promise<string[] | null> {
  const modalRef = modal.open(KpiPicker, { ariaLabelledBy: 'kpi-picker-heading' });
  const picker = modalRef.componentInstance as KpiPicker;
  picker.available.set(available);
  picker.chosen.set([...chosen]);
  picker.keep.set([...keep]);
  try {
    return (await modalRef.result) as string[];
  } catch {
    return null;
  }
}

/** Pick up to six figures for My Day and put them in order. */
@Component({
  selector: 'app-kpi-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header">
      <h2 id="kpi-picker-heading" class="modal-title h5">Your figures</h2>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        (click)="activeModal.dismiss()"
      ></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3">
      <p class="small text-body-secondary mb-0">
        Pick up to {{ room() }} numbers to keep an eye on. They're worked out fresh each time you
        open My Day.
      </p>

      <div>
        <h3 class="h6">On My Day</h3>
        <ul class="list-group">
          @for (key of chosen(); track key; let first = $first; let last = $last) {
            <li class="list-group-item d-flex align-items-center gap-2">
              <span class="flex-grow-1 min-w-0">{{ labelOf(key) }}</span>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                [disabled]="first"
                [attr.aria-label]="'Move ' + labelOf(key) + ' up'"
                (click)="move(key, -1)"
              >
                <i class="bi bi-arrow-up"></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                [disabled]="last"
                [attr.aria-label]="'Move ' + labelOf(key) + ' down'"
                (click)="move(key, 1)"
              >
                <i class="bi bi-arrow-down"></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                [attr.aria-label]="'Remove ' + labelOf(key)"
                (click)="remove(key)"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </li>
          } @empty {
            <li class="list-group-item small text-body-secondary">None yet. Add some below.</li>
          }
        </ul>
      </div>

      @if (unchosen().length > 0) {
        <div>
          <h3 class="h6">Add</h3>
          <div class="d-flex flex-wrap gap-2">
            @for (item of unchosen(); track item.key) {
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                [disabled]="chosen().length >= room()"
                (click)="add(item.key)"
              >
                <i class="bi bi-plus-lg"></i> {{ item.label }}
              </button>
            }
          </div>
          @if (chosen().length >= room()) {
            <p class="small text-body-secondary mt-2 mb-0">
              That's the most My Day shows. Remove one to add another.
            </p>
          }
        </div>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
        Cancel
      </button>
      <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
        Save
      </button>
    </div>
  `,
})
export class KpiPicker {
  protected readonly activeModal = inject(NgbActiveModal);
  private readonly dashboardService = inject(DashboardService);
  private readonly toast = inject(ToastService);

  readonly available = signal<readonly KpiDefinition[]>([]);
  readonly chosen = signal<string[]>([]);
  /** Chosen tiles of modules switched off in Settings: not offered here, but kept (and counted) when saving. */
  readonly keep = signal<string[]>([]);

  protected readonly room = computed(() => MAX_TILES - this.keep().length);
  protected readonly saving = signal(false);
  protected readonly unchosen = computed(() =>
    this.available().filter((item) => !this.chosen().includes(item.key)),
  );

  protected labelOf(key: string): string {
    return this.available().find((item) => item.key === key)?.label ?? key;
  }

  protected add(key: string): void {
    this.chosen.update((keys) => (keys.length < this.room() ? [...keys, key] : keys));
  }

  protected remove(key: string): void {
    this.chosen.update((keys) => keys.filter((k) => k !== key));
  }

  protected move(key: string, by: -1 | 1): void {
    this.chosen.update((keys) => moveKey(keys, key, by));
  }

  protected save(): void {
    this.saving.set(true);
    this.dashboardService.saveKpis([...this.chosen(), ...this.keep()]).subscribe({
      next: (keys) => this.activeModal.close(keys),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save your figures.'));
      },
    });
  }
}
