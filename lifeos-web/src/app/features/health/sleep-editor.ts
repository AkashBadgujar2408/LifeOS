import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  NgbActiveModal,
  NgbInputDatepicker,
  NgbModal,
  NgbTimepicker,
  NgbTimeStruct,
} from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HealthService, SleepRecord } from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { utcToLocalParts } from '../calendar/calendar-feed';
import { durationText, sleepSpan } from './health-view';

/** Opens a sleep record (new when missing); resolves true when something changed. */
export async function openSleepEditor(modal: NgbModal, record?: SleepRecord): Promise<boolean> {
  const modalRef = modal.open(SleepEditor, { ariaLabelledBy: 'sleep-editor-heading' });
  (modalRef.componentInstance as SleepEditor).configure(record);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

const time = (hour: number, minute: number): NgbTimeStruct => ({ hour, minute, second: 0 });
const QUALITY_WORDS = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];

/**
 * A night's sleep (or a nap): the morning it counts for, when you went to bed and woke up — a bedtime later on the
 * clock than waking up was the evening before — and how it felt.
 */
@Component({
  selector: 'app-sleep-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgbTimepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="sleep-editor-heading" class="modal-title h5">
          {{ record() ? 'Edit sleep' : 'Log sleep' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div>
          <label class="form-label" for="sleep-day">Woke up on</label>
          <div class="input-group">
            <input
              id="sleep-day"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('wokeOn')"
              formControlName="wokeOn"
              placeholder="e.g. 19/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #day="ngbDatepicker"
              [maxDate]="maxDate"
              container="body"
              ngbAutofocus
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
          @if (fieldError('wokeOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-6">
            <span class="form-label d-block" id="sleep-bed-label">Went to sleep</span>
            <ngb-timepicker
              formControlName="bed"
              [spinners]="false"
              [minuteStep]="5"
              [meridian]="true"
              aria-labelledby="sleep-bed-label"
            />
          </div>
          <div class="col-6">
            <span class="form-label d-block" id="sleep-wake-label">Woke up</span>
            <ngb-timepicker
              formControlName="wake"
              [spinners]="false"
              [minuteStep]="5"
              [meridian]="true"
              aria-labelledby="sleep-wake-label"
            />
          </div>
        </div>
        @if (length(); as l) {
          <p class="small text-body-secondary mb-0">{{ l }}</p>
        }
        @if (timeError(); as error) {
          <div class="invalid-feedback d-block">{{ error }}</div>
        }
        <div>
          <span class="form-label d-block" id="sleep-quality-label">How it felt</span>
          <div
            class="btn-group btn-group-sm flex-wrap"
            role="group"
            aria-labelledby="sleep-quality-label"
          >
            @for (word of qualityWords; track word; let i = $index) {
              <button
                type="button"
                class="btn"
                [class.btn-primary]="form.controls.quality.value === i + 1"
                [class.btn-outline-secondary]="form.controls.quality.value !== i + 1"
                [attr.aria-pressed]="form.controls.quality.value === i + 1"
                (click)="setQuality(i + 1)"
              >
                {{ word }}
              </button>
            }
          </div>
        </div>
        <div class="form-check">
          <input id="sleep-nap" type="checkbox" class="form-check-input" formControlName="isNap" />
          <label class="form-check-label" for="sleep-nap"
            >A nap
            <span class="text-body-secondary small">(left out of nightly averages)</span></label
          >
        </div>
        <div>
          <label class="form-label" for="sleep-notes"
            >Notes <span class="text-body-secondary small">(encrypted, optional)</span></label
          >
          <textarea
            id="sleep-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Woke at 3, late coffee, noisy street"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (record()) {
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
export class SleepEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly qualityWords = QUALITY_WORDS;
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly record = signal<SleepRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly timeError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    wokeOn: this.fb.control<string | null>(todayIso(), Validators.required),
    bed: this.fb.control<NgbTimeStruct | null>(time(23, 0)),
    wake: this.fb.control<NgbTimeStruct | null>(time(7, 0)),
    quality: this.fb.control<number | null>(null),
    isNap: this.fb.nonNullable.control(false),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  private readonly times = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** "8 h" under the times, so a bedtime on the wrong side of midnight is obvious. */
  protected readonly length = computed(() => {
    const v = this.times();
    if (!v.bed || !v.wake) {
      return null;
    }
    const bed = v.bed.hour * 60 + v.bed.minute;
    const wake = v.wake.hour * 60 + v.wake.minute;
    const minutes = bed >= wake ? 24 * 60 - bed + wake : wake - bed;
    return minutes === 0
      ? null
      : `${durationText(minutes)}${bed >= wake ? ', from the evening before' : ''}`;
  });

  configure(record?: SleepRecord): void {
    this.record.set(record ?? null);
    const start = record ? utcToLocalParts(record.startedAt) : null;
    const end = record ? utcToLocalParts(record.endedAt) : null;
    this.form.reset({
      wokeOn: record?.wokeOn ?? todayIso(),
      bed: start ? time(start.hour, start.minute) : time(23, 0),
      wake: end ? time(end.hour, end.minute) : time(7, 0),
      quality: record?.quality ?? null,
      isNap: record?.isNap ?? false,
      notes: record?.notes ?? '',
    });
  }

  protected setQuality(value: number): void {
    const control = this.form.controls.quality;
    control.setValue(control.value === value ? null : value);
  }

  protected fieldError(name: 'wokeOn' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'notes') {
      return 'Keep it under 4,000 characters.';
    }
    return control.errors['required']
      ? 'Pick the morning it counts for.'
      : control.errors['future']
        ? "Can't be ahead of today."
        : dateFieldError(control.errors);
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    if (v.wokeOn && v.wokeOn > todayIso()) {
      this.form.controls.wokeOn.setErrors({ future: true });
    }
    const sameTime =
      v.bed && v.wake && v.bed.hour === v.wake.hour && v.bed.minute === v.wake.minute;
    this.timeError.set(
      !v.bed || !v.wake
        ? 'Give both times.'
        : sameTime
          ? "Going to sleep and waking can't be the same time."
          : null,
    );
    if (this.form.invalid || this.timeError()) {
      this.form.markAllAsTouched();
      return;
    }
    const span = sleepSpan(v.wokeOn!, v.bed!, v.wake!);
    this.saving.set(true);
    this.healthService
      .saveSleep(this.record()?.id ?? null, {
        wokeOn: v.wokeOn!,
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        quality: v.quality,
        isNap: v.isNap,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save it.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this sleep?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (confirmed.isConfirmed) {
      this.healthService.removeSleep(record.id).subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
      });
    }
  }
}
