import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  Dose,
  DoseStatus,
  HealthLockedError,
  HealthService,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { doseCounts, timeLabel } from './health-view';

/**
 * A day's scheduled doses, ticked like habit days: Taken, Skipped, or tap again to clear. Fetches itself; emits
 * `changed` with the day's counts after each mark so hosts (My Day) can update their summary.
 */
@Component({
  selector: 'app-todays-doses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError],
  template: `
    @if (loadFailed()) {
      <app-load-error [message]="loadFailed()!" (retry)="load()" />
    } @else if (doses(); as doses) {
      @if (doses.length === 0) {
        <p class="text-body-secondary small mb-0">
          No doses due {{ isToday() ? 'today' : 'that day' }}.
        </p>
      } @else {
        <p class="small text-body-secondary mb-2">
          {{ counts().taken }} of {{ counts().due }} taken
          @if (counts().done > counts().taken) {
            · {{ counts().done - counts().taken }} skipped
          }
        </p>
        <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
          @for (d of doses; track d.scheduleId) {
            <li class="d-flex flex-wrap align-items-center gap-2">
              <span class="text-body-secondary small" style="min-width: 4.5rem">{{
                time(d.timeOfDay)
              }}</span>
              <span class="flex-grow-1 min-w-0">
                <span
                  class="fw-semibold"
                  [class.text-decoration-line-through]="d.status === 'Skipped'"
                  [class.text-body-secondary]="d.status !== null"
                  >{{ d.medicationName }}</span
                >
                @if (d.strength || d.dose) {
                  <span class="small text-body-secondary">
                    {{ d.strength }}{{ d.strength && d.dose ? ' · ' : '' }}{{ d.dose }}</span
                  >
                }
              </span>
              <span
                class="btn-group btn-group-sm"
                role="group"
                [attr.aria-label]="d.medicationName + ' at ' + time(d.timeOfDay)"
              >
                <button
                  type="button"
                  class="btn"
                  [class.btn-primary]="d.status === 'Taken'"
                  [class.btn-outline-primary]="d.status !== 'Taken'"
                  [attr.aria-pressed]="d.status === 'Taken'"
                  [disabled]="busy() === d.scheduleId"
                  (click)="mark(d, 'Taken')"
                >
                  <i class="bi bi-check-lg" aria-hidden="true"></i> Taken
                </button>
                <button
                  type="button"
                  class="btn"
                  [class.btn-secondary]="d.status === 'Skipped'"
                  [class.btn-outline-secondary]="d.status !== 'Skipped'"
                  [attr.aria-pressed]="d.status === 'Skipped'"
                  [disabled]="busy() === d.scheduleId"
                  (click)="mark(d, 'Skipped')"
                >
                  Skipped
                </button>
              </span>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="text-body-secondary small mb-0">Loading...</p>
    }
  `,
})
export class TodaysDoses {
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** The day (ISO); today by default. */
  readonly day = input<string>(todayIso());
  /** Bumped by the host to re-read (after a medicine is saved). */
  readonly version = input(0);
  readonly changed = output<{ due: number; done: number }>();

  protected readonly doses = signal<Dose[] | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected readonly counts = computed(() => doseCounts(this.doses() ?? []));
  protected readonly isToday = computed(() => this.day() === todayIso());
  protected readonly time = timeLabel;

  constructor() {
    effect(() => {
      this.version();
      this.day();
      this.load();
    });
  }

  protected load(): void {
    this.healthService
      .doses(this.day())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (doses) => {
          this.doses.set(doses);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load the day's doses.",
          ),
      });
  }

  /** Tapping the status it already has clears it. */
  protected mark(dose: Dose, status: DoseStatus): void {
    this.busy.set(dose.scheduleId);
    const next = dose.status === status ? null : status;
    this.healthService.setDose(this.day(), dose.scheduleId, next, todayIso()).subscribe({
      next: (doses) => {
        this.busy.set(null);
        this.doses.set(doses);
        const { due, done } = doseCounts(doses);
        this.changed.emit({ due, done });
      },
      error: (err) => {
        this.busy.set(null);
        if (!(err instanceof HealthLockedError)) {
          this.toast.error(apiErrorMessage(err, 'Could not mark the dose.'));
        }
      },
    });
  }
}
