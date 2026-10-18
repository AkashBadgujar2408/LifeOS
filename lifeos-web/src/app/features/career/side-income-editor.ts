import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  SIDE_INCOME_KINDS,
  SIDE_INCOME_STATUSES,
  SideIncomeKind,
  SideIncomeSource,
  SideIncomeStatus,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { SIDE_INCOME_KIND_LABELS, SIDE_INCOME_STATUS_LABELS } from './career-view';

export type SideIncomeEditorResult =
  { kind: 'saved'; source: SideIncomeSource } | { kind: 'deleted' };

/** Opens a side income source (new when missing); resolves with what happened, or null if dismissed. */
export async function openSideIncomeEditor(
  modal: NgbModal,
  source?: SideIncomeSource,
): Promise<SideIncomeEditorResult | null> {
  const modalRef = modal.open(SideIncomeEditor, { ariaLabelledBy: 'side-income-editor-heading' });
  (modalRef.componentInstance as SideIncomeEditor).configure(source);
  try {
    return (await modalRef.result) as SideIncomeEditorResult;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-side-income-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="side-income-editor-heading" class="modal-title h5">
          {{ source() ? 'Edit side income' : 'Add side income' }}
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
          <label class="form-label" for="side-name">What it is</label>
          <input
            id="side-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Weekend Angular workshops"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label" for="side-kind">Kind</label>
            <select id="side-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-6">
            <label class="form-label" for="side-status">Status</label>
            <select id="side-status" class="form-select" formControlName="status">
              @for (status of statuses; track status) {
                <option [ngValue]="status" [selected]="status === form.controls.status.value">
                  {{ statusLabels[status] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="side-started">
              Started <span class="text-body-secondary small">(optional)</span>
            </label>
            <div class="input-group">
              <input
                id="side-started"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('startedOn')"
                formControlName="startedOn"
                placeholder="e.g. 01/Jun/2025"
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
                aria-label="Pick the day it started"
                (click)="startPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('startedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          @if (form.controls.status.value === 'Ended') {
            <div class="col-sm-6">
              <label class="form-label" for="side-ended">
                Ended <span class="text-body-secondary small">(optional)</span>
              </label>
              <div class="input-group">
                <input
                  id="side-ended"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError('endedOn')"
                  formControlName="endedOn"
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
                  aria-label="Pick the day it ended"
                  (click)="endPicker.toggle()"
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
          <label class="form-label" for="side-url">
            Link <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="side-url"
            type="url"
            class="form-control"
            [class.is-invalid]="fieldError('url')"
            formControlName="url"
            placeholder="https://… (your profile, channel or site)"
            autocomplete="off"
          />
          @if (fieldError('url'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="side-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="side-notes"
            class="form-control"
            rows="3"
            formControlName="notes"
            placeholder="Rates, clients, what it takes each week"
          ></textarea>
        </div>
        <p class="small text-body-secondary mb-0">
          What it earns goes in Finance as income marked for it — here is what it is and whether
          it's going.
        </p>
      </div>
      <div class="modal-footer">
        @if (source()) {
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
export class SideIncomeEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = SIDE_INCOME_KINDS;
  protected readonly statuses = SIDE_INCOME_STATUSES;
  protected readonly kindLabels = SIDE_INCOME_KIND_LABELS;
  protected readonly statusLabels = SIDE_INCOME_STATUS_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly source = signal<SideIncomeSource | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<SideIncomeKind>('Freelance'),
    status: this.fb.nonNullable.control<SideIncomeStatus>('Active'),
    startedOn: this.fb.control<string | null>(null),
    endedOn: this.fb.control<string | null>(null),
    url: this.fb.nonNullable.control('', [
      Validators.maxLength(2000),
      Validators.pattern(/^\s*(https?:\/\/\S+)?\s*$/i),
    ]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(source?: SideIncomeSource): void {
    this.source.set(source ?? null);
    this.form.reset({
      name: source?.name ?? '',
      kind: source?.kind ?? 'Freelance',
      status: source?.status ?? 'Active',
      startedOn: source?.startedOn ?? null,
      endedOn: source?.endedOn ?? null,
      url: source?.url ?? '',
      notes: source?.notes ?? '',
    });
  }

  protected fieldError(name: 'name' | 'startedOn' | 'endedOn' | 'url'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'startedOn' || name === 'endedOn') {
      return dateFieldError(control.errors);
    }
    if (control.errors['required']) {
      return 'Say what it is.';
    }
    if (control.errors['pattern']) {
      return 'Paste the full web address, starting with https://';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveSideIncome(this.source()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        status: v.status,
        startedOn: v.startedOn,
        endedOn: v.status === 'Ended' ? v.endedOn : null,
        url: v.url.trim() || null,
        notes: v.notes.trim() || null,
        today: todayIso(),
      })
      .subscribe({
        next: (source) => this.activeModal.close({ kind: 'saved', source }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the side income.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const source = this.source();
    if (!source) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${source.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeSideIncome(source.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the side income.')),
    });
  }
}
