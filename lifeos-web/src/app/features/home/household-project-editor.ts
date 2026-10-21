import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import { HomeService, HouseholdProject } from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';

export type HouseholdProjectEditorResult =
  { kind: 'saved'; project: HouseholdProject } | { kind: 'removed' };

/** Opens a household project (new when missing); resolves with what happened, or null if dismissed. */
export async function openHouseholdProjectEditor(
  modal: NgbModal,
  project?: HouseholdProject,
): Promise<HouseholdProjectEditorResult | null> {
  const modalRef = modal.open(HouseholdProjectEditor, {
    ariaLabelledBy: 'household-project-heading',
  });
  (modalRef.componentInstance as HouseholdProjectEditor).configure(project);
  try {
    return (await modalRef.result) as HouseholdProjectEditorResult;
  } catch {
    return null;
  }
}

const STATUSES: HouseholdProject['status'][] = ['Active', 'Completed', 'Archived'];

/**
 * A household project: an ordinary tasks project (name, status, its tasks on the project page) plus the property it's
 * for and a budget. What's spent is the expenses linked to the project.
 */
@Component({
  selector: 'app-household-project-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="household-project-heading" class="modal-title h5">
          {{ project() ? 'Edit project' : 'Start a household project' }}
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
          <label class="form-label" for="hp-name">Name</label>
          <input
            id="hp-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Repaint the flat"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-7">
            <label class="form-label" for="hp-property">For</label>
            <ng-select
              labelForId="hp-property"
              formControlName="propertyId"
              placeholder="No property in particular"
            >
              @for (p of properties(); track p.id) {
                <ng-option [value]="p.id">
                  {{ p.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="hp-status">Status</label>
            <select id="hp-status" class="form-select" formControlName="status">
              @for (s of statuses; track s) {
                <option [ngValue]="s" [selected]="s === form.controls.status.value">{{ s }}</option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-7">
            <label class="form-label" for="hp-budget">
              Budget <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="hp-budget"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('budget')"
              formControlName="budget"
              placeholder="e.g. 80000"
            />
            @if (fieldError('budget'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-5">
            <label class="form-label" for="hp-currency">Currency</label>
            <ng-select
              labelForId="hp-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="—"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="hp-description">
            What it involves <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="hp-description"
            class="form-control"
            rows="2"
            formControlName="description"
            placeholder="Rooms, the contractor, what's decided so far"
          ></textarea>
        </div>
        <p class="small text-body-secondary mb-0">
          Its tasks live on the project page. Link expenses to the project (from the ledger or the
          project's links) and they count toward the budget.
        </p>
      </div>
      <div class="modal-footer">
        @if (project()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            Stop tracking
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
export class HouseholdProjectEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly statuses = STATUSES;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly properties = toSignal(
    this.homeService.properties().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly project = signal<HouseholdProject | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    propertyId: this.fb.control<number | null>(null),
    status: this.fb.nonNullable.control<HouseholdProject['status']>('Active'),
    budget: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  configure(project?: HouseholdProject): void {
    this.project.set(project ?? null);
    this.form.reset({
      name: project?.name ?? '',
      propertyId: project?.propertyId ?? null,
      status: project?.status ?? 'Active',
      budget: project?.budget ?? null,
      currency: project?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      description: project?.description ?? '',
    });
  }

  protected fieldError(name: 'name' | 'budget' | 'currency'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required']
          ? 'Name the project (e.g. Repaint the flat).'
          : 'That is too long.';
      case 'budget':
        return 'Has to be more than zero — or leave it blank.';
      default:
        return 'Choose the budget’s currency.';
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    this.form.controls.currency.updateValueAndValidity();
    const v = this.form.getRawValue();
    if (v.budget !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .saveHouseholdProject(this.project()?.id ?? null, {
        name: v.name,
        description: v.description.trim() || null,
        status: v.status,
        propertyId: v.propertyId,
        budget: v.budget,
        currency: v.budget !== null ? v.currency : null,
      })
      .subscribe({
        next: (project) => this.activeModal.close({ kind: 'saved', project }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the project.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Stop tracking "${project.name}" here?`,
      text: 'Its budget and property go; the project and its tasks stay in Projects.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Stop tracking',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeHouseholdProject(project.id).subscribe({
      next: () => this.activeModal.close({ kind: 'removed' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not do that.')),
    });
  }
}
