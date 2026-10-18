import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NgbInputDatepicker, NgbTimepicker } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { RoundForm, roundScheduleError } from './interview-fields';

/**
 * A round's what/when/where fields, shared by the interview editor and the "move to Interviewing" dialog. The
 * host owns the form and its submit; `submitted` shows the errors of untouched fields once a save was tried.
 */
@Component({
  selector: 'app-round-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgbTimepicker],
  template: `
    <div [formGroup]="form()" class="d-flex flex-column gap-3">
      <div>
        <label class="form-label" for="round-title">Round</label>
        <input
          id="round-title"
          type="text"
          class="form-control"
          [class.is-invalid]="titleError()"
          formControlName="title"
          placeholder="e.g. Technical round"
          autocomplete="off"
        />
        @if (titleError(); as error) {
          <div class="invalid-feedback d-block">{{ error }}</div>
        }
      </div>
      <div class="form-check form-switch">
        <input
          id="round-scheduled"
          class="form-check-input"
          type="checkbox"
          role="switch"
          formControlName="scheduled"
        />
        <label class="form-check-label" for="round-scheduled">
          It has a time — put it on the calendar
        </label>
      </div>
      @if (form().controls.scheduled.value) {
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="round-date">Day</label>
            <div class="input-group">
              <input
                id="round-date"
                type="text"
                class="form-control"
                [class.is-invalid]="dateError()"
                formControlName="date"
                placeholder="e.g. 20/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #roundPicker="ngbDatepicker"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="roundPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <span class="form-label d-block" id="round-start-label">Starts</span>
            <ngb-timepicker
              formControlName="startTime"
              [spinners]="false"
              [minuteStep]="5"
              [meridian]="true"
              aria-labelledby="round-start-label"
            />
          </div>
          <div class="col-6 col-sm-3">
            <span class="form-label d-block" id="round-end-label">Ends</span>
            <ngb-timepicker
              formControlName="endTime"
              [spinners]="false"
              [minuteStep]="5"
              [meridian]="true"
              aria-labelledby="round-end-label"
            />
          </div>
        </div>
        @if (dateError() ?? scheduleError(); as error) {
          <div class="invalid-feedback d-block mt-n2">{{ error }}</div>
        }
        <div>
          <label class="form-label" for="round-location">
            Where <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="round-location"
            type="text"
            class="form-control"
            formControlName="location"
            placeholder="e.g. Zoom link, or the office address"
            autocomplete="off"
          />
        </div>
      }
      <div>
        <label class="form-label" for="round-prep">
          Prep notes <span class="text-body-secondary small">(optional)</span>
        </label>
        <textarea
          id="round-prep"
          class="form-control"
          rows="3"
          formControlName="prepNotes"
          placeholder="Who you'll meet, what to revise, questions to ask them"
        ></textarea>
      </div>
    </div>
  `,
})
export class RoundFields {
  readonly form = input.required<RoundForm>();
  readonly submitted = input(false);

  protected titleError(): string | null {
    const control = this.form().controls.title;
    if (!(control.touched || this.submitted()) || !control.errors) {
      return null;
    }
    return control.errors['required'] ? 'Name the round.' : 'That is too long.';
  }

  protected dateError(): string | null {
    const control = this.form().controls.date;
    return control.touched || this.submitted() ? dateFieldError(control.errors) : null;
  }

  protected scheduleError(): string | null {
    return this.submitted() ? roundScheduleError(this.form()) : null;
  }
}
