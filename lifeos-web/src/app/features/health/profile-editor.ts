import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  BLOOD_GROUPS,
  BloodGroup,
  HealthProfile,
  HealthService,
  SEXES,
  Sex,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';

/** Opens the health profile; resolves with the saved profile, or null if dismissed. */
export async function openProfileEditor(
  modal: NgbModal,
  profile: HealthProfile,
): Promise<HealthProfile | null> {
  const modalRef = modal.open(ProfileEditor, { ariaLabelledBy: 'profile-editor-heading' });
  (modalRef.componentInstance as ProfileEditor).configure(profile);
  try {
    return (await modalRef.result) as HealthProfile;
  } catch {
    return null;
  }
}

/** The basics a doctor or an emergency card asks for — every field optional. */
@Component({
  selector: 'app-health-profile-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="profile-editor-heading" class="modal-title h5">Health profile</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="profile-born">Date of birth</label>
            <div class="input-group">
              <input
                id="profile-born"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('dateOfBirth')"
                formControlName="dateOfBirth"
                placeholder="e.g. 02/Apr/1990"
                autocomplete="off"
                ngbDatepicker
                #born="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
                ngbAutofocus
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the date of birth"
                (click)="born.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('dateOfBirth'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="profile-sex">
              Sex <span class="text-body-secondary small">(for reference ranges)</span>
            </label>
            <select id="profile-sex" class="form-select" formControlName="sex">
              <option [ngValue]="null" [selected]="form.controls.sex.value === null">
                Rather not say
              </option>
              @for (s of sexes; track s) {
                <option [ngValue]="s" [selected]="s === form.controls.sex.value">{{ s }}</option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="profile-blood">Blood group</label>
            <select id="profile-blood" class="form-select" formControlName="bloodGroup">
              <option [ngValue]="null" [selected]="form.controls.bloodGroup.value === null">
                Not known
              </option>
              @for (g of bloodGroups; track g) {
                <option [ngValue]="g" [selected]="g === form.controls.bloodGroup.value">
                  {{ g }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="profile-height">Height (cm)</label>
            <input
              id="profile-height"
              type="number"
              step="0.1"
              class="form-control"
              [class.is-invalid]="fieldError('heightCm')"
              formControlName="heightCm"
              placeholder="e.g. 172"
            />
            @if (fieldError('heightCm'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="profile-donor">Organ donor</label>
            <select id="profile-donor" class="form-select" formControlName="isOrganDonor">
              <option [ngValue]="null" [selected]="form.controls.isOrganDonor.value === null">
                Not set
              </option>
              <option [ngValue]="true" [selected]="form.controls.isOrganDonor.value === true">
                Yes
              </option>
              <option [ngValue]="false" [selected]="form.controls.isOrganDonor.value === false">
                No
              </option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label" for="profile-notes">
            Notes <span class="text-body-secondary small">(encrypted)</span>
          </label>
          <textarea
            id="profile-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Anything a doctor should know first — implants, a pacemaker, a rare reaction"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class ProfileEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly sexes = SEXES;
  protected readonly bloodGroups = BLOOD_GROUPS;
  protected readonly minDate = { year: new Date().getFullYear() - 120, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    dateOfBirth: this.fb.control<string | null>(null),
    sex: this.fb.control<Sex | null>(null),
    bloodGroup: this.fb.control<BloodGroup | null>(null),
    heightCm: this.fb.control<number | null>(null, [Validators.min(30), Validators.max(272)]),
    isOrganDonor: this.fb.control<boolean | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(profile: HealthProfile): void {
    this.form.reset({
      dateOfBirth: profile.dateOfBirth,
      sex: profile.sex,
      bloodGroup: profile.bloodGroup,
      heightCm: profile.heightCm,
      isOrganDonor: profile.isOrganDonor,
      notes: profile.notes ?? '',
    });
  }

  protected fieldError(name: 'dateOfBirth' | 'heightCm' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'heightCm':
        return 'Between 30 and 272 cm — or leave it blank.';
      case 'notes':
        return 'Keep it under 4,000 characters.';
      default:
        return control.errors['future']
          ? "A date of birth can't be in the future."
          : dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.dateOfBirth && v.dateOfBirth > today) {
      this.form.controls.dateOfBirth.setErrors({ future: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService.saveProfile({ ...v, notes: v.notes.trim() || null, today }).subscribe({
      next: (profile) => this.activeModal.close(profile),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save your profile.'));
      },
    });
  }
}
