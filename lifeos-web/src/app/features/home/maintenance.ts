import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { HomeService, MaintenanceTask } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { recurrenceLabel } from '../tasks/task-views';
import { HOME_TARGET_LABELS, dueStatus } from './home-view';
import { openMaintenanceDone, openMaintenanceEditor } from './maintenance-editor';

/** Maintenance that comes round again: due soonest first (overdue on top), paused ones last. */
@Component({
  selector: 'app-home-maintenance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Maintenance</h1>
          <p class="text-body-secondary mb-0 small">
            Servicing and upkeep — mark it done and the next one is worked out from that day.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add maintenance
        </button>
      </div>

      @if (loadFailed() && !tasks()) {
        <app-load-error message="Couldn't load your maintenance." (retry)="load()" />
      } @else if (tasks(); as tasks) {
        @if (tasks.length === 0) {
          <p class="text-body-secondary">
            Nothing planned yet. Add the car's servicing, the water purifier's filter or cleaning
            the water tank, and you'll be reminded before each one's due.
          </p>
        } @else {
          <div class="card">
            <ul class="list-group list-group-flush">
              @for (t of tasks; track t.id) {
                @let due = dueOf(t.nextDueOn);
                <li class="list-group-item py-3" [class.text-body-secondary]="t.isPaused">
                  <div class="d-flex flex-wrap gap-2 align-items-start">
                    <i class="bi bi-tools mt-1" aria-hidden="true"></i>
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(t)"
                      >
                        {{ t.title }}
                      </button>
                      <div class="small text-body-secondary">
                        {{ repeat(t) }}
                        @if (t.targetName && t.targetType) {
                          · {{ targetLabels[t.targetType].toLowerCase() }}: {{ t.targetName }}
                        }
                        @if (t.lastDoneOn) {
                          · last done {{ t.lastDoneOn | date }}
                        }
                        @if (t.contactName) {
                          · {{ t.contactName }}
                        }
                      </div>
                    </div>
                    <div class="small text-end">
                      @if (t.isPaused) {
                        Paused
                      } @else {
                        <div
                          [class.text-danger-emphasis]="due.state === 'past'"
                          [class.fw-semibold]="due.state === 'soon' || due.state === 'today'"
                        >
                          {{ t.nextDueOn | date }}
                        </div>
                        @if (due.state !== 'later') {
                          <div>{{ due.label }}</div>
                        }
                      }
                    </div>
                    @if (!t.isPaused) {
                      <button
                        type="button"
                        class="btn btn-outline-primary btn-sm align-self-center"
                        (click)="done(t)"
                      >
                        <i class="bi bi-check2" aria-hidden="true"></i> Done
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeMaintenance {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly targetLabels = HOME_TARGET_LABELS;
  protected readonly tasks = signal<MaintenanceTask[] | null>(null);
  protected readonly loadFailed = signal(false);
  private readonly today = todayIso();

  constructor() {
    this.load();
  }

  protected load(): void {
    this.homeService
      .maintenance()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tasks) => {
          this.tasks.set(tasks);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected repeat(task: MaintenanceTask): string {
    return recurrenceLabel({
      frequency: task.recurrenceFrequency,
      interval: task.recurrenceInterval,
    });
  }

  protected dueOf(day: string) {
    return dueStatus(day, this.today);
  }

  protected async edit(task?: MaintenanceTask): Promise<void> {
    const result = await openMaintenanceEditor(this.modal, task);
    // Reload even on dismiss: a log taken back in the editor moves the due day.
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
    }
  }

  protected async done(task: MaintenanceTask): Promise<void> {
    if (await openMaintenanceDone(this.modal, task, task.targetType === 'Vehicle')) {
      this.load();
      this.toast.success('Done — the next one is scheduled.');
    }
  }
}
