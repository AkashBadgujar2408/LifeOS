import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthLockedError, HealthService, Medication } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { scheduleLabel } from '../habits/habit-schedule';
import { medicationGroups, timeLabel } from './health-view';
import { openMedicationEditor } from './medication-editor';
import { TodaysDoses } from './todays-doses';

/** Medicines: today's doses to tick, what you take now (with how well it's been kept), and what you've stopped. */
@Component({
  selector: 'app-health-medications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, TodaysDoses],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Medicines</h1>
          <p class="text-body-secondary mb-0 small">
            Tick each dose like a habit day; skipped ones are fine to mark too.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a medicine
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (medications()) {
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5">Today</h2>
            <app-todays-doses [version]="version()" (changed)="load()" />
          </div>
        </div>

        @if (
          groups().current.length === 0 &&
          groups().upcoming.length === 0 &&
          groups().stopped.length === 0
        ) {
          <p class="text-body-secondary">
            No medicines yet. Add one with its times to tick doses here and on My Day.
          </p>
        }
        @for (section of sections(); track section.title) {
          @if (section.items.length) {
            <h2 class="h6 text-body-secondary text-uppercase small mt-3">{{ section.title }}</h2>
            <div class="card mb-3">
              <ul class="list-group list-group-flush">
                @for (m of section.items; track m.id) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap gap-3 align-items-start">
                      <i class="bi bi-capsule mt-1" aria-hidden="true"></i>
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                          (click)="edit(m)"
                        >
                          {{ m.name }}
                        </button>
                        @if (m.strength) {
                          <span class="text-body-secondary small">{{ m.strength }}</span>
                        }
                        <div class="small text-body-secondary">
                          @if (m.isAsNeeded) {
                            When needed
                            @if (m.lastTakenOn) {
                              · last {{ m.lastTakenOn | date }} · {{ m.takenLast30Days }} in 30 days
                            }
                          } @else {
                            @for (s of m.schedules; track s.id; let last = $last) {
                              {{ time(s.timeOfDay) }}{{ s.dose ? ' (' + s.dose + ')' : '' }}
                              {{ days(s.scheduleDays) === 'Every day' ? '' : days(s.scheduleDays)
                              }}{{ last ? '' : ', ' }}
                            }
                          }
                        </div>
                        <div class="small text-body-secondary">
                          @if (section.title === 'Starting later') {
                            Starts {{ m.startDate | date }}
                          } @else if (m.endDate) {
                            {{ m.endDate < today ? 'Stopped' : 'Until' }} {{ m.endDate | date }}
                          } @else {
                            Since {{ m.startDate | date }}
                          }
                          @if (m.conditionName) {
                            · for {{ m.conditionName }}
                          }
                        </div>
                      </div>
                      @if (m.isAsNeeded && section.title === 'Taking now') {
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          [disabled]="busy() === m.id"
                          (click)="tookOne(m)"
                        >
                          <i class="bi bi-plus-lg"></i> Took one
                        </button>
                      } @else if (m.adherence !== null) {
                        <div class="text-end">
                          <div class="fw-semibold">{{ m.adherence }}%</div>
                          <div class="small text-body-secondary">taken, 30 days</div>
                        </div>
                      }
                    </div>
                  </li>
                }
              </ul>
            </div>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthMedications {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly time = timeLabel;
  protected readonly days = scheduleLabel;
  protected readonly today = todayIso();
  protected readonly medications = signal<Medication[] | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  protected readonly busy = signal<number | null>(null);
  /** Bumped after a save so today's doses re-read. */
  protected readonly version = signal(0);
  protected readonly groups = computed(() =>
    medicationGroups(this.medications() ?? [], this.today),
  );
  protected readonly sections = computed(() => [
    { title: 'Taking now', items: this.groups().current },
    { title: 'Starting later', items: this.groups().upcoming },
    { title: 'Stopped', items: this.groups().stopped },
  ]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .medications(this.today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (medications) => {
          this.medications.set(medications);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your medicines.",
          ),
      });
  }

  protected async edit(medication?: Medication): Promise<void> {
    const result = await openMedicationEditor(this.modal, medication);
    this.load();
    this.version.update((v) => v + 1);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Medicine saved.' : 'Medicine deleted.');
    }
  }

  protected tookOne(medication: Medication): void {
    this.busy.set(medication.id);
    this.healthService.logAsNeeded(medication.id, this.today, this.today).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.medications.update(
          (list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? null,
        );
        this.toast.success(`${updated.name} logged.`);
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not log the dose.'));
      },
    });
  }
}
