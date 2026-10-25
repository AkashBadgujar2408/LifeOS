import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  NgbActiveModal,
  NgbInputDatepicker,
  NgbModal,
  NgbTimepicker,
  NgbTimeStruct,
} from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ContactsService } from '../../core/services/contacts.service';
import { DoctorVisit, HealthService } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { localDateTimeToUtc, utcToLocalParts } from '../calendar/calendar-feed';

export type VisitEditorResult = { kind: 'saved'; visit: DoctorVisit } | { kind: 'deleted' };

/** Opens a visit (new when missing); resolves with what happened, or null if dismissed. */
export async function openVisitEditor(
  modal: NgbModal,
  visit?: DoctorVisit,
): Promise<VisitEditorResult | null> {
  const modalRef = modal.open(VisitEditor, { ariaLabelledBy: 'visit-editor-heading', size: 'lg' });
  (modalRef.componentInstance as VisitEditor).configure(visit);
  try {
    return (await modalRef.result) as VisitEditorResult;
  } catch {
    return null;
  }
}

const time = (hour: number, minute: number): NgbTimeStruct => ({ hour, minute, second: 0 });
const minutesOf = (t: NgbTimeStruct) => t.hour * 60 + t.minute;

/**
 * A doctor visit: what it's for, who and where, the appointment time (goes on the calendar as "Doctor's
 * appointment"), when to go back (a reminder a week before), encrypted consultation notes and — once saved —
 * linked documents (reports, prescriptions) and reminders.
 */
@Component({
  selector: 'app-visit-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    NgbTimepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="visit-editor-heading" class="modal-title h5">
          {{ visit() ? 'Edit visit' : 'Add a visit' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-7">
            <label class="form-label" for="visit-reason">What it's for</label>
            <input
              id="visit-reason"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('reason')"
              formControlName="reason"
              placeholder="e.g. Diabetes review"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('reason'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="visit-day">Day</label>
            <div class="input-group">
              <input
                id="visit-day"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('visitOn')"
                formControlName="visitOn"
                placeholder="e.g. 22/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #day="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="day.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('visitOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <div class="form-check">
            <input
              id="visit-timed"
              type="checkbox"
              class="form-check-input"
              formControlName="timed"
            />
            <label class="form-check-label" for="visit-timed">
              It has an appointment time
              <span class="text-body-secondary small"
                >(shows on the calendar as "Doctor's appointment")</span
              >
            </label>
          </div>
          @if (form.controls.timed.value) {
            <div class="row g-3 mt-0">
              <div class="col-6 col-sm-4">
                <span class="form-label d-block" id="visit-start-label">Starts</span>
                <ngb-timepicker
                  formControlName="startTime"
                  [spinners]="false"
                  [minuteStep]="5"
                  [meridian]="true"
                  aria-labelledby="visit-start-label"
                />
              </div>
              <div class="col-6 col-sm-4">
                <span class="form-label d-block" id="visit-end-label">Ends</span>
                <ngb-timepicker
                  formControlName="endTime"
                  [spinners]="false"
                  [minuteStep]="5"
                  [meridian]="true"
                  aria-labelledby="visit-end-label"
                />
              </div>
            </div>
            @if (timeError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="visit-doctor">
              Doctor <span class="text-body-secondary small">(a contact)</span>
            </label>
            <ng-select
              labelForId="visit-doctor"
              formControlName="contactId"
              placeholder="Pick a doctor (optional)"
            >
              @for (c of contacts(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="visit-specialty">Specialty</label>
            <input
              id="visit-specialty"
              type="text"
              class="form-control"
              formControlName="specialty"
              placeholder="e.g. Endocrinology"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="visit-place">Where</label>
            <input
              id="visit-place"
              type="text"
              class="form-control"
              formControlName="place"
              placeholder="e.g. City Clinic"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="visit-condition">
              About <span class="text-body-secondary small">(from your history)</span>
            </label>
            <ng-select
              labelForId="visit-condition"
              formControlName="conditionId"
              placeholder="Nothing in particular"
            >
              @for (c of conditions(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="visit-followup">
              Follow-up <span class="text-body-secondary small">(reminder a week before)</span>
            </label>
            <div class="input-group">
              <input
                id="visit-followup"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('followUpOn')"
                formControlName="followUpOn"
                placeholder="When to go back"
                autocomplete="off"
                ngbDatepicker
                #followUp="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the follow-up day"
                (click)="followUp.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('followUpOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="visit-notes">
            Consultation notes <span class="text-body-secondary small">(encrypted, optional)</span>
          </label>
          <textarea
            id="visit-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="What the doctor found and said, questions for next time"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (visit(); as v) {
          @if (v.prescribed.length) {
            <p class="small mb-0">
              <span class="text-body-secondary">Prescribed:</span> {{ v.prescribed.join(', ') }}
            </p>
          }
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the report or prescription from Documents — put it in the vault so it's encrypted
              too.
            </p>
            <app-linked-items
              entityType="DoctorVisit"
              [entityId]="v.id"
              preferredLinkType="Document"
            />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="DoctorVisit"
              [entityId]="v.id"
              [entityTitle]="v.reason"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (visit()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class VisitEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 5, month: 12, day: 31 };
  protected readonly contacts = toSignal(
    inject(ContactsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly conditions = toSignal(
    this.healthService.conditions().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly visit = signal<DoctorVisit | null>(null);
  protected readonly saving = signal(false);
  protected readonly timeError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    reason: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    visitOn: this.fb.control<string | null>(todayIso(), Validators.required),
    timed: this.fb.nonNullable.control(false),
    startTime: this.fb.control<NgbTimeStruct | null>(time(10, 0)),
    endTime: this.fb.control<NgbTimeStruct | null>(time(10, 30)),
    contactId: this.fb.control<number | null>(null),
    specialty: this.fb.nonNullable.control('', Validators.maxLength(100)),
    place: this.fb.nonNullable.control('', Validators.maxLength(200)),
    conditionId: this.fb.control<number | null>(null),
    followUpOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(visit?: DoctorVisit): void {
    this.visit.set(visit ?? null);
    const start = visit?.startsAt ? utcToLocalParts(visit.startsAt) : null;
    const end = visit?.endsAt ? utcToLocalParts(visit.endsAt) : null;
    this.form.reset({
      reason: visit?.reason ?? '',
      visitOn: start?.date ?? visit?.visitOn ?? todayIso(),
      timed: start !== null,
      startTime: start ? time(start.hour, start.minute) : time(10, 0),
      endTime: end ? time(end.hour, end.minute) : time(10, 30),
      contactId: visit?.contactId ?? null,
      specialty: visit?.specialty ?? '',
      place: visit?.place ?? '',
      conditionId: visit?.conditionId ?? null,
      followUpOn: visit?.followUpOn ?? null,
      notes: visit?.notes ?? '',
    });
  }

  protected fieldError(name: 'reason' | 'visitOn' | 'followUpOn' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'reason':
        return control.errors['required'] ? 'Say what the visit is for.' : 'That is too long.';
      case 'visitOn':
        return control.errors['required'] ? 'Pick the day.' : dateFieldError(control.errors);
      case 'followUpOn':
        return control.errors['beforeVisit']
          ? "The follow-up can't be before the visit."
          : dateFieldError(control.errors);
      default:
        return 'Keep it under 4,000 characters.';
    }
  }

  protected submit(): void {
    const reason = this.form.controls.reason;
    reason.setValue(reason.value.trim());
    const v = this.form.getRawValue();
    if (v.followUpOn && v.visitOn && v.followUpOn < v.visitOn) {
      this.form.controls.followUpOn.setErrors({ beforeVisit: true });
    }
    let timeError: string | null = null;
    if (v.timed) {
      timeError =
        !v.startTime || !v.endTime
          ? 'Give the start and end time.'
          : minutesOf(v.endTime) <= minutesOf(v.startTime)
            ? 'It has to end after it starts.'
            : null;
    }
    this.timeError.set(timeError);
    if (this.form.invalid || timeError) {
      this.form.markAllAsTouched();
      return;
    }
    const timed = v.timed && v.startTime && v.endTime;
    this.saving.set(true);
    this.healthService
      .saveVisit(this.visit()?.id ?? null, {
        reason: v.reason,
        visitOn: v.visitOn!,
        contactId: v.contactId,
        specialty: v.specialty.trim() || null,
        place: v.place.trim() || null,
        conditionId: v.conditionId,
        startsAt: timed
          ? localDateTimeToUtc(v.visitOn!, v.startTime!.hour, v.startTime!.minute)
          : null,
        endsAt: timed ? localDateTimeToUtc(v.visitOn!, v.endTime!.hour, v.endTime!.minute) : null,
        followUpOn: v.followUpOn,
        notes: v.notes.trim() || null,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (visit) => this.activeModal.close({ kind: 'saved', visit }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the visit.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const visit = this.visit();
    if (!visit) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${visit.reason}"?`,
      text: 'Its calendar entry and follow-up reminder go too. Linked documents and medicines stay.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.healthService.removeVisit(visit.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the visit.')),
    });
  }
}
