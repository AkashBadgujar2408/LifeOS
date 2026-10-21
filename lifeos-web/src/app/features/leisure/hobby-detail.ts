import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import {
  APP_DATE_FORMAT,
  APP_DATE_TIME_FORMAT,
  dateFieldError,
} from '../../core/dates/date-format';
import { DataGrid } from '../../core/grid/data-grid';
import { dayComparator, dayFormatter } from '../../core/grid/grid-format';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  HOBBY_ENTITY_TYPE,
  HobbyDetail as HobbyDetailModel,
  HobbySession,
  LeisureService,
} from '../../core/services/leisure.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { openHobbyEditor } from './hobby-editor';
import { PracticeTimer } from './practice-timer';

/** One hobby: the practice timer, time typed in afterwards, every session, links and reminders. */
@Component({
  selector: 'app-hobby-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataGrid,
    RouterLink,
    ReactiveFormsModule,
    NgbInputDatepicker,
    PracticeTimer,
    LinkedItems,
    EntityReminders,
    LoadError,
  ],
  template: `
    <div class="container py-4">
      <a routerLink="/leisure/hobbies" class="small text-decoration-none d-inline-block mb-2">
        <i class="bi bi-arrow-left"></i> Hobbies
      </a>
      @if (loadFailed() && !hobby()) {
        <app-load-error message="Couldn't load this hobby." (retry)="load()" />
      } @else if (hobby(); as hobby) {
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-4">
          <div class="min-w-0">
            <div class="small text-body-secondary mb-1">
              Hobby{{ hobby.status === 'Archived' ? ' · archived' : '' }}
              @if (hobby.habitTitle) {
                · practised through <a routerLink="/habits">{{ hobby.habitTitle }}</a>
              }
              @if (hobby.lifeAreaName) {
                · {{ hobby.lifeAreaName }}
              }
            </div>
            <h1 class="h3 mb-0 text-break">{{ hobby.name }}</h1>
            @if (hobby.description) {
              <p class="text-body-secondary mb-0 text-break" style="white-space: pre-line">
                {{ hobby.description }}
              </p>
            }
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="edit(hobby)">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" (click)="remove(hobby)">
              <i class="bi bi-trash"></i> Delete
            </button>
          </div>
        </div>

        <div class="row g-3">
          <div class="col-lg-8 d-flex flex-column gap-3">
            <section class="card" aria-labelledby="hobby-timer-heading">
              <div class="card-body">
                <h2 id="hobby-timer-heading" class="h6 mb-2">Practise now</h2>
                <app-practice-timer [hobbyId]="hobby.id" (logged)="load()" />
              </div>
            </section>

            <section class="card" aria-labelledby="hobby-sessions-heading">
              <div class="card-body">
                <h2 id="hobby-sessions-heading" class="h6 mb-1">
                  Practice
                  @if (hobby.sessionCount > 0) {
                    <span class="text-body-secondary fw-normal small"
                      >· {{ hobby.sessionCount }}
                      {{ hobby.sessionCount === 1 ? 'session' : 'sessions' }} ·
                      {{ formatMinutes(hobby.totalMinutes) }}</span
                    >
                  }
                </h2>
                <form
                  [formGroup]="sessionForm"
                  (ngSubmit)="addSession(hobby.id)"
                  class="d-flex flex-wrap align-items-start gap-2 my-3"
                  novalidate
                >
                  <div>
                    <label class="visually-hidden" for="session-day">Day</label>
                    <div class="input-group" style="max-width: 12rem">
                      <input
                        id="session-day"
                        type="text"
                        class="form-control"
                        [class.is-invalid]="fieldError('practicedOn')"
                        formControlName="practicedOn"
                        placeholder="e.g. 14/Oct/2026"
                        autocomplete="off"
                        ngbDatepicker
                        #dayPicker="ngbDatepicker"
                        [minDate]="minDate"
                        container="body"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-secondary"
                        aria-label="Pick the day"
                        (click)="dayPicker.toggle()"
                      >
                        <i class="bi bi-calendar3"></i>
                      </button>
                    </div>
                    @if (fieldError('practicedOn'); as error) {
                      <div class="invalid-feedback d-block">{{ error }}</div>
                    }
                  </div>
                  <div>
                    <label class="visually-hidden" for="session-minutes">Minutes</label>
                    <input
                      id="session-minutes"
                      type="number"
                      min="1"
                      class="form-control"
                      style="max-width: 8rem"
                      [class.is-invalid]="fieldError('minutes')"
                      formControlName="minutes"
                      placeholder="Minutes"
                    />
                    @if (fieldError('minutes'); as error) {
                      <div class="invalid-feedback d-block">{{ error }}</div>
                    }
                  </div>
                  <div class="flex-grow-1" style="min-width: 10rem">
                    <label class="visually-hidden" for="session-note">Note</label>
                    <input
                      id="session-note"
                      type="text"
                      class="form-control"
                      [class.is-invalid]="fieldError('note')"
                      formControlName="note"
                      placeholder="What you worked on (optional)"
                      (keydown.enter)="$event.preventDefault(); addSession(hobby.id)"
                    />
                    @if (fieldError('note'); as error) {
                      <div class="invalid-feedback d-block">{{ error }}</div>
                    }
                  </div>
                  <button type="submit" class="btn btn-primary" [disabled]="saving()">
                    Log time
                  </button>
                </form>
                @if (hobby.sessions.length === 0) {
                  <p class="small text-body-secondary mb-0">No practice logged yet.</p>
                } @else {
                  <p class="small text-body-secondary mb-2">Pick a session to remove it.</p>
                  <app-data-grid
                    name="hobby-sessions"
                    [rows]="hobby.sessions"
                    [columns]="columns"
                    [phoneColumns]="['practicedOn', 'minutes', 'note']"
                    [rowId]="rowId"
                    [noun]="['session', 'sessions']"
                    (open)="removeSession(hobby.id, $event)"
                  />
                }
              </div>
            </section>
          </div>
          <div class="col-lg-4 d-flex flex-column gap-3">
            <div class="card">
              <div class="card-body">
                <app-linked-items [entityType]="entityType" [entityId]="hobby.id" />
              </div>
            </div>
            <div class="card">
              <div class="card-body">
                <app-entity-reminders
                  entityType="Hobby"
                  [entityId]="hobby.id"
                  [entityTitle]="hobby.name"
                />
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
export class HobbyDetail {
  private readonly fb = inject(FormBuilder);
  private readonly leisureService = inject(LeisureService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly entityType = HOBBY_ENTITY_TYPE;
  protected readonly formatMinutes = formatMinutes;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly hobby = signal<HobbyDetailModel | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  private readonly titled = itemTitle(() => this.hobby()?.name);
  protected readonly rowId = (s: HobbySession) => s.id;
  protected readonly columns: ColDef<HobbySession>[] = [
    {
      headerName: 'Day',
      field: 'practicedOn',
      sort: 'desc',
      width: 125,
      valueFormatter: dayFormatter(this.locale),
      comparator: dayComparator,
    },
    {
      headerName: 'Time',
      field: 'minutes',
      width: 100,
      type: 'rightAligned',
      valueFormatter: (p) => formatMinutes((p.value as number) ?? 0),
    },
    {
      headerName: 'How',
      field: 'startedAt',
      width: 190,
      valueFormatter: (p) =>
        p.value
          ? `Timer, ${formatDate(p.value as string, APP_DATE_TIME_FORMAT, this.locale)}`
          : 'Logged by hand',
    },
    { headerName: 'Note', field: 'note', flex: 1, minWidth: 150 },
  ];

  protected readonly sessionForm = this.fb.group({
    practicedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    minutes: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(1440),
    ]),
    note: this.fb.nonNullable.control('', Validators.maxLength(1000)),
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.leisureService
      .hobby(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hobby) => {
          this.hobby.set(hobby);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected fieldError(name: 'practicedOn' | 'minutes' | 'note'): string | null {
    const control = this.sessionForm.controls[name];
    if (!(control.touched || this.attempted()) || !control.errors) {
      return null;
    }
    switch (name) {
      case 'practicedOn':
        return dateFieldError(control.errors) ?? 'Pick the day.';
      case 'minutes':
        return 'Enter 1 to 1,440 minutes.';
      default:
        return 'Keep it under 1000 characters.';
    }
  }

  protected addSession(hobbyId: number): void {
    this.attempted.set(true);
    if (this.sessionForm.invalid) {
      return;
    }
    const v = this.sessionForm.getRawValue();
    this.saving.set(true);
    this.leisureService
      .addSession(hobbyId, {
        practicedOn: v.practicedOn!,
        minutes: v.minutes!,
        startedAt: null,
        note: v.note.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.attempted.set(false);
          this.sessionForm.reset({ practicedOn: todayIso(), minutes: null, note: '' });
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not log the time.'));
        },
      });
  }

  protected async removeSession(hobbyId: number, session: HobbySession): Promise<void> {
    const confirmed = await Swal.fire({
      title: 'Remove this session?',
      text: `${formatMinutes(session.minutes)} on ${formatDate(session.practicedOn, APP_DATE_FORMAT, this.locale)}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.leisureService.removeSession(hobbyId, session.id).subscribe({
      next: () => this.load(),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove it.')),
    });
  }

  protected async edit(hobby: HobbyDetailModel): Promise<void> {
    const saved = await openHobbyEditor(this.modal, hobby);
    if (saved) {
      this.hobby.set(saved);
      this.toast.success('Hobby saved.');
    }
  }

  protected async remove(hobby: HobbyDetailModel): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete ${hobby.name}?`,
      text: 'Its practice log goes with it. To keep it but put it away, archive it from Edit instead.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.leisureService.removeHobby(hobby.id).subscribe({
      next: () => {
        this.toast.success('Hobby deleted.');
        void this.router.navigate(['/leisure/hobbies']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the hobby.')),
    });
  }
}
