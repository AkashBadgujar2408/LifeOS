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
import { APP_TIME_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import {
  DoctorVisit,
  HealthLockedError,
  HealthProfile,
  HealthService,
  MedicalCondition,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { followUpsDue, visitBuckets } from './health-view';
import { openProfileEditor } from './profile-editor';
import { TodaysDoses } from './todays-doses';
import { openVisitEditor } from './visit-editor';

/**
 * Health at a glance: the profile (what an emergency needs first — blood group, allergies), today's doses, and
 * what's coming up (visits, follow-ups). Everything here is behind the vault unlock.
 */
@Component({
  selector: 'app-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, TodaysDoses],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Health</h1>
          <p class="text-body-secondary mb-0 small">
            <i class="bi bi-shield-lock" aria-hidden="true"></i> Private: open only with your
            password, notes encrypted.
          </p>
        </div>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="row g-3">
          <div class="col-lg-6">
            <div class="card h-100">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <h2 class="h5 mb-0">Profile</h2>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    (click)="editProfile()"
                  >
                    <i class="bi bi-pencil"></i> Edit
                  </button>
                </div>
                @if (d.profile.updatedAt === null) {
                  <p class="text-body-secondary small mb-0">
                    Add your date of birth, blood group and height — what a doctor or an emergency
                    asks first.
                  </p>
                } @else {
                  <dl class="row small mb-0">
                    <dt class="col-5 fw-normal text-body-secondary">Age</dt>
                    <dd class="col-7">
                      {{ d.profile.age !== null ? d.profile.age + ' years' : '—' }}
                    </dd>
                    <dt class="col-5 fw-normal text-body-secondary">Blood group</dt>
                    <dd class="col-7 fw-semibold">{{ d.profile.bloodGroup ?? '—' }}</dd>
                    <dt class="col-5 fw-normal text-body-secondary">Height</dt>
                    <dd class="col-7">
                      {{ d.profile.heightCm !== null ? d.profile.heightCm + ' cm' : '—' }}
                    </dd>
                    <dt class="col-5 fw-normal text-body-secondary">Organ donor</dt>
                    <dd class="col-7">
                      {{
                        d.profile.isOrganDonor === null
                          ? '—'
                          : d.profile.isOrganDonor
                            ? 'Yes'
                            : 'No'
                      }}
                    </dd>
                    @if (d.profile.notes) {
                      <dt class="col-5 fw-normal text-body-secondary">Notes</dt>
                      <dd class="col-7 text-break" style="white-space: pre-line">
                        {{ d.profile.notes }}
                      </dd>
                    }
                  </dl>
                }
                <div class="border-top mt-3 pt-3">
                  <h3 class="h6">Allergies</h3>
                  @if (allergies().length === 0) {
                    <p class="small text-body-secondary mb-0">
                      None recorded. <a routerLink="/health/history">Add one</a> so it's never
                      missed.
                    </p>
                  } @else {
                    <ul class="list-unstyled small mb-0">
                      @for (a of allergies(); track a.id) {
                        <li>
                          <i
                            class="bi bi-exclamation-octagon"
                            [class.text-danger]="a.severity === 'Severe'"
                            aria-hidden="true"
                          ></i>
                          <span class="fw-semibold">{{ a.name }}</span>
                          @if (a.severity) {
                            <span class="text-body-secondary"> · {{ a.severity }}</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="card h-100">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <h2 class="h5 mb-0">Today's doses</h2>
                  <a class="small" routerLink="/health/medications">All medicines</a>
                </div>
                <app-todays-doses />
              </div>
            </div>
          </div>
          <div class="col-12">
            <div class="card">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <h2 class="h5 mb-0">Coming up</h2>
                  <button type="button" class="btn btn-sm btn-outline-primary" (click)="addVisit()">
                    <i class="bi bi-plus-lg"></i> Add a visit
                  </button>
                </div>
                @if (upcoming().length === 0 && followUps().length === 0) {
                  <p class="small text-body-secondary mb-0">No visits or follow-ups ahead.</p>
                } @else {
                  <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
                    @for (v of upcoming(); track v.id) {
                      <li class="d-flex gap-2">
                        <i class="bi bi-hospital mt-1" aria-hidden="true"></i>
                        <div class="min-w-0">
                          <a class="fw-semibold" routerLink="/health/visits">{{ v.reason }}</a>
                          <div class="small text-body-secondary">
                            {{ v.visitOn | date }}
                            @if (v.startsAt) {
                              · {{ v.startsAt | date: timeFormat }}
                            }
                            @if (v.contactName) {
                              · {{ v.contactName }}
                            }
                          </div>
                        </div>
                      </li>
                    }
                    @for (v of followUps(); track v.id) {
                      <li class="d-flex gap-2">
                        <i class="bi bi-arrow-repeat mt-1" aria-hidden="true"></i>
                        <div class="min-w-0">
                          <span class="fw-semibold">Follow-up: {{ v.reason }}</span>
                          <div class="small text-body-secondary">Due {{ v.followUpOn | date }}</div>
                        </div>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Health {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly timeFormat = APP_TIME_FORMAT;
  protected readonly data = signal<{
    profile: HealthProfile;
    conditions: MedicalCondition[];
    visits: DoctorVisit[];
  } | null>(null);
  protected readonly loadFailed = signal<string | null>(null);
  private readonly today = todayIso();

  protected readonly allergies = computed(() =>
    (this.data()?.conditions ?? []).filter((c) => c.kind === 'Allergy' && c.endedOn === null),
  );
  protected readonly upcoming = computed(
    () => visitBuckets(this.data()?.visits ?? [], this.today).upcoming,
  );
  protected readonly followUps = computed(() =>
    followUpsDue(this.data()?.visits ?? [], this.today),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    forkJoin({
      profile: this.healthService.profile(this.today),
      conditions: this.healthService.conditions(),
      visits: this.healthService.visits(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your health records.",
          ),
      });
  }

  protected async editProfile(): Promise<void> {
    const data = this.data();
    if (!data) {
      return;
    }
    const profile = await openProfileEditor(this.modal, data.profile);
    if (profile) {
      this.data.set({ ...data, profile });
      this.toast.success('Profile saved.');
    }
  }

  protected async addVisit(): Promise<void> {
    const result = await openVisitEditor(this.modal);
    if (result) {
      this.load();
      this.toast.success('Visit saved.');
    }
  }
}
