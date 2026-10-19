import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CONDITION_KINDS,
  ConditionKind,
  HealthService,
  MedicalCondition,
  SEVERITIES,
  Severity,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { CONDITION_KIND_LABELS, SEVERITY_LABELS } from './health-view';

export type ConditionEditorResult =
  { kind: 'saved'; condition: MedicalCondition } | { kind: 'deleted' };

/** Opens a medical history item (new of `kind` when missing); resolves with what happened, or null. */
export async function openConditionEditor(
  modal: NgbModal,
  condition?: MedicalCondition,
  kind: ConditionKind = 'Condition',
): Promise<ConditionEditorResult | null> {
  const modalRef = modal.open(ConditionEditor, { ariaLabelledBy: 'condition-editor-heading' });
  (modalRef.componentInstance as ConditionEditor).configure(condition, kind);
  try {
    return (await modalRef.result) as ConditionEditorResult;
  } catch {
    return null;
  }
}

/** A condition (diagnosis), an allergy or a surgery, with when, how bad (allergies) and encrypted notes. */
@Component({
  selector: 'app-condition-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, LinkedItems],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="condition-editor-heading" class="modal-title h5">
          {{ condition() ? 'Edit' : 'Add' }}
          {{ kindLabels[form.controls.kind.value].toLowerCase() }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="btn-group" role="group" aria-label="Kind">
          @for (k of kinds; track k) {
            <input
              type="radio"
              class="btn-check"
              [id]="'condition-kind-' + k"
              formControlName="kind"
              [value]="k"
            />
            <label class="btn btn-outline-primary" [for]="'condition-kind-' + k">{{
              kindLabels[k]
            }}</label>
          }
        </div>
        <div>
          <label class="form-label" for="condition-name">Name</label>
          <input
            id="condition-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            [placeholder]="namePlaceholder()"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (form.controls.kind.value === 'Allergy') {
          <div>
            <label class="form-label" for="condition-severity">Severity</label>
            <select id="condition-severity" class="form-select" formControlName="severity">
              <option [ngValue]="null" [selected]="form.controls.severity.value === null">
                Not sure
              </option>
              @for (s of severities; track s) {
                <option [ngValue]="s" [selected]="s === form.controls.severity.value">
                  {{ severityLabels[s] }}
                </option>
              }
            </select>
          </div>
        }
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="condition-started">
              {{ form.controls.kind.value === 'Surgery' ? 'Done on' : 'Since' }}
              <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="condition-started"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('startedOn')"
                formControlName="startedOn"
                placeholder="e.g. 01/Mar/2024"
                autocomplete="off"
                ngbDatepicker
                #started="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the start"
                (click)="started.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('startedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          @if (form.controls.kind.value !== 'Surgery') {
            <div class="col-sm-6">
              <label class="form-label" for="condition-ended">
                Resolved <span class="text-body-secondary small">(blank if ongoing)</span>
              </label>
              <div class="input-group">
                <input
                  id="condition-ended"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('endedOn')"
                  formControlName="endedOn"
                  placeholder="Leave blank if it's ongoing"
                  autocomplete="off"
                  ngbDatepicker
                  #ended="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  aria-label="Pick when it resolved"
                  (click)="ended.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError('endedOn'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div>
          <label class="form-label" for="condition-notes">
            Notes <span class="text-body-secondary small">(encrypted, optional)</span>
          </label>
          <textarea
            id="condition-notes"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Reaction, treatment, what helps"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (condition(); as c) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link reports from Documents (keep them in the vault).
            </p>
            <app-linked-items
              entityType="MedicalCondition"
              [entityId]="c.id"
              preferredLinkType="Document"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (condition()) {
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
export class ConditionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = CONDITION_KINDS;
  protected readonly kindLabels = CONDITION_KIND_LABELS;
  protected readonly severities = SEVERITIES;
  protected readonly severityLabels = SEVERITY_LABELS;
  protected readonly minDate = { year: 1920, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();
  protected readonly condition = signal<MedicalCondition | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<ConditionKind>('Condition'),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    severity: this.fb.control<Severity | null>(null),
    startedOn: this.fb.control<string | null>(null),
    endedOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(condition: MedicalCondition | undefined, kind: ConditionKind): void {
    this.condition.set(condition ?? null);
    this.form.reset({
      kind: condition?.kind ?? kind,
      name: condition?.name ?? '',
      severity: condition?.severity ?? null,
      startedOn: condition?.startedOn ?? null,
      endedOn: condition?.endedOn ?? null,
      notes: condition?.notes ?? '',
    });
  }

  protected namePlaceholder(): string {
    switch (this.form.controls.kind.value) {
      case 'Allergy':
        return 'e.g. Penicillin';
      case 'Surgery':
        return 'e.g. Appendix removed';
      default:
        return 'e.g. Type 2 diabetes';
    }
  }

  protected fieldError(name: 'name' | 'startedOn' | 'endedOn' | 'notes'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Give it a name.' : 'That is too long.';
      case 'notes':
        return 'Keep it under 4,000 characters.';
      default:
        if (control.errors['future']) {
          return "Medical history can't be dated in the future.";
        }
        if (control.errors['beforeStart']) {
          return "It can't have ended before it started.";
        }
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    const v = this.form.getRawValue();
    const today = todayIso();
    const surgery = v.kind === 'Surgery';
    const endedOn = surgery ? null : v.endedOn;
    for (const field of ['startedOn', 'endedOn'] as const) {
      const value = field === 'endedOn' ? endedOn : v.startedOn;
      if (value && value > today) {
        this.form.controls[field].setErrors({ future: true });
      }
    }
    if (endedOn && v.startedOn && endedOn < v.startedOn) {
      this.form.controls.endedOn.setErrors({ beforeStart: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.healthService
      .saveCondition(this.condition()?.id ?? null, {
        kind: v.kind,
        name: v.name,
        severity: v.kind === 'Allergy' ? v.severity : null,
        startedOn: v.startedOn,
        endedOn,
        notes: v.notes.trim() || null,
        today,
      })
      .subscribe({
        next: (condition) => this.activeModal.close({ kind: 'saved', condition }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save it.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const condition = this.condition();
    if (!condition) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${condition.name}"?`,
      text: 'Visits and medicines about it stay, without it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.healthService.removeCondition(condition.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete it.')),
    });
  }
}
