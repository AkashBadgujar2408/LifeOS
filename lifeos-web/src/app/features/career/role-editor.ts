import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  EMPLOYMENT_ENTITY_TYPE,
  EMPLOYMENT_TYPES,
  Employment,
  EmploymentType,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { EMPLOYMENT_TYPE_LABELS } from './career-view';

export type RoleEditorResult = { kind: 'saved'; role: Employment } | { kind: 'deleted' };

/** Opens the role dialog (new when missing); resolves with what happened, or null if dismissed. */
export async function openRoleEditor(
  modal: NgbModal,
  role?: Employment,
): Promise<RoleEditorResult | null> {
  const modalRef = modal.open(RoleEditor, { ariaLabelledBy: 'role-editor-heading', size: 'lg' });
  (modalRef.componentInstance as RoleEditor).configure(role);
  try {
    return (await modalRef.result) as RoleEditorResult;
  } catch {
    return null;
  }
}

// Mirrors CK_Employments_Dates.
function roleDates(group: AbstractControl): ValidationErrors | null {
  const { startDate, endDate } = group.value as {
    startDate: string | null;
    endDate: string | null;
  };
  return startDate && endDate && endDate < startDate ? { endsBeforeStart: true } : null;
}

@Component({
  selector: 'app-role-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, LinkedItems, EntityReminders],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="role-editor-heading" class="modal-title h5">
          {{ role() ? 'Edit role' : 'Add a role' }}
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
          <div class="col-sm-6">
            <label class="form-label" for="role-title">Role</label>
            <input
              id="role-title"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('role')"
              formControlName="role"
              placeholder="e.g. Backend Developer"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('role'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="role-org">Organisation</label>
            <input
              id="role-org"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('organisation')"
              formControlName="organisation"
              placeholder="e.g. Acme Corp"
              autocomplete="off"
            />
            @if (fieldError('organisation'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="role-type">Kind of work</label>
            <select id="role-type" class="form-select" formControlName="employmentType">
              @for (type of types; track type) {
                <option [ngValue]="type" [selected]="type === form.controls.employmentType.value">
                  {{ typeLabels[type] }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="role-location">
              Location <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="role-location"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('location')"
              formControlName="location"
              placeholder="e.g. Pune, or Remote"
              autocomplete="off"
            />
            @if (fieldError('location'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="role-start">Started</label>
            <div class="input-group">
              <input
                id="role-start"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('startDate')"
                formControlName="startDate"
                placeholder="e.g. 10/Jan/2022"
                autocomplete="off"
                ngbDatepicker
                #startPicker="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the start date"
                (click)="startPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('startDate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="role-end">
              Ended <span class="text-body-secondary small">(blank if you're still there)</span>
            </label>
            <div class="input-group">
              <input
                id="role-end"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('endDate')"
                formControlName="endDate"
                placeholder="e.g. 31/Mar/2024"
                autocomplete="off"
                ngbDatepicker
                #endPicker="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the end date"
                (click)="endPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('endDate'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="role-description">
            What it involved <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="role-description"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('description')"
            formControlName="description"
            placeholder="The team, what you owned, the stack"
          ></textarea>
          @if (fieldError('description'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        @if (role(); as existing) {
          <div class="border-top pt-3">
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Employment"
              [entityId]="existing.id"
              [entityTitle]="existing.role + ' at ' + existing.organisation"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (role()) {
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
export class RoleEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = EMPLOYMENT_ENTITY_TYPE;
  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };
  protected readonly role = signal<Employment | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      role: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
      organisation: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.maxLength(200),
      ]),
      employmentType: this.fb.nonNullable.control<EmploymentType>('FullTime'),
      location: this.fb.nonNullable.control('', Validators.maxLength(200)),
      startDate: this.fb.control<string | null>(null, Validators.required),
      endDate: this.fb.control<string | null>(null),
      description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    },
    { validators: roleDates },
  );

  configure(role?: Employment): void {
    this.role.set(role ?? null);
    this.form.reset({
      role: role?.role ?? '',
      organisation: role?.organisation ?? '',
      employmentType: role?.employmentType ?? 'FullTime',
      location: role?.location ?? '',
      startDate: role?.startDate ?? null,
      endDate: role?.endDate ?? null,
      description: role?.description ?? '',
    });
  }

  protected fieldError(
    name: 'role' | 'organisation' | 'location' | 'startDate' | 'endDate' | 'description',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'startDate') {
      return control.errors?.['required'] ? 'When did it start?' : dateFieldError(control.errors);
    }
    if (name === 'endDate') {
      return (
        dateFieldError(control.errors) ??
        (this.form.errors?.['endsBeforeStart'] ? "It can't end before it started." : null)
      );
    }
    if (control.errors?.['required']) {
      return name === 'role' ? 'Name the role.' : 'Name the organisation.';
    }
    return control.errors?.['maxlength'] ? 'That is too long.' : null;
  }

  protected submit(): void {
    for (const name of ['role', 'organisation'] as const) {
      const control = this.form.controls[name];
      control.setValue(control.value.trim());
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveEmployment(this.role()?.id ?? null, {
        organisation: v.organisation,
        role: v.role,
        employmentType: v.employmentType,
        location: v.location.trim() || null,
        startDate: v.startDate!,
        endDate: v.endDate,
        description: v.description.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (role) => this.activeModal.close({ kind: 'saved', role }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the role.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const role = this.role();
    if (!role) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${role.role}" at ${role.organisation}?`,
      text: 'Its salary history, achievements and reviews stay, without a role.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeEmployment(role.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the role.')),
    });
  }
}
