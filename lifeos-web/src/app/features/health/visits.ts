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
import { APP_TIME_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { DoctorVisit, HealthLockedError, HealthService } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { visitBuckets } from './health-view';
import { openVisitEditor } from './visit-editor';

/** Doctor visits: what's coming up (soonest first), then the visits you've had. */
@Component({
  selector: 'app-health-visits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Doctor visits</h1>
          <p class="text-body-secondary mb-0 small">
            Appointments go on your calendar; a follow-up day sets a reminder a week before.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a visit
        </button>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (visits(); as visits) {
        @if (visits.length === 0) {
          <p class="text-body-secondary">
            No visits yet. Add your next appointment, or one you've had, to keep its notes and
            reports together.
          </p>
        } @else {
          @for (section of sections(); track section.title) {
            @if (section.visits.length) {
              <h2 class="h6 text-body-secondary text-uppercase small mt-3">{{ section.title }}</h2>
              <div class="card mb-3">
                <ul class="list-group list-group-flush">
                  @for (v of section.visits; track v.id) {
                    <li class="list-group-item py-3">
                      <div class="d-flex gap-3 align-items-start">
                        <i class="bi bi-hospital mt-1" aria-hidden="true"></i>
                        <div class="min-w-0 flex-grow-1">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                            (click)="edit(v)"
                          >
                            {{ v.reason }}
                          </button>
                          <div class="small text-body-secondary">
                            {{ v.visitOn | date }}
                            @if (v.startsAt) {
                              · {{ v.startsAt | date: timeFormat }}
                            }
                            ·
                            {{ v.contactName ?? 'No doctor named' }}
                            @if (v.specialty) {
                              · {{ v.specialty }}
                            }
                            @if (v.place) {
                              · {{ v.place }}
                            }
                          </div>
                          @if (v.conditionName || v.prescribed.length || v.followUpOn) {
                            <div class="small">
                              @if (v.conditionName) {
                                <span class="badge text-bg-light border me-1">{{
                                  v.conditionName
                                }}</span>
                              }
                              @if (v.prescribed.length) {
                                <span class="text-body-secondary me-1">
                                  <i class="bi bi-capsule" aria-hidden="true"></i>
                                  {{ v.prescribed.join(', ') }}
                                </span>
                              }
                              @if (v.followUpOn) {
                                <span [class.fw-semibold]="v.followUpOn >= today">
                                  <i class="bi bi-arrow-repeat" aria-hidden="true"></i> Follow-up
                                  {{ v.followUpOn | date }}
                                </span>
                              }
                            </div>
                          }
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthVisits {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly timeFormat = APP_TIME_FORMAT;
  protected readonly today = todayIso();
  protected readonly visits = signal<DoctorVisit[] | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  protected readonly sections = computed(() => {
    const { upcoming, past } = visitBuckets(this.visits() ?? [], this.today);
    return [
      { title: 'Coming up', visits: upcoming },
      { title: 'Past visits', visits: past },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .visits()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (visits) => {
          this.visits.set(visits);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your visits.",
          ),
      });
  }

  protected async edit(visit?: DoctorVisit): Promise<void> {
    const result = await openVisitEditor(this.modal, visit);
    // Reload even on dismiss: links and reminders added in the editor apply immediately.
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Visit saved.' : 'Visit deleted.');
    }
  }
}
