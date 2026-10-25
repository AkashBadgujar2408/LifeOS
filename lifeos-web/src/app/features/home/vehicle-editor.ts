import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import {
  FUEL_UNITS,
  FuelUnit,
  HomeService,
  VEHICLE_KINDS,
  Vehicle,
  VehicleKind,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { FUEL_UNIT_LABELS, VEHICLE_KIND_LABELS } from './home-view';

export type VehicleEditorResult = { kind: 'saved'; vehicle: Vehicle } | { kind: 'deleted' };

/** Opens a vehicle (new when missing); resolves with what happened, or null if dismissed. */
export async function openVehicleEditor(
  modal: NgbModal,
  vehicle?: Vehicle,
): Promise<VehicleEditorResult | null> {
  const modalRef = modal.open(VehicleEditor, {
    ariaLabelledBy: 'vehicle-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as VehicleEditor).configure(vehicle);
  try {
    return (await modalRef.result) as VehicleEditorResult;
  } catch {
    return null;
  }
}

/**
 * A vehicle: what it is, its insurance (a Finance policy — renewal reminded there), the PUC and registration
 * valid-until days (reminded here, N days before) and, once saved, its papers linked from Documents.
 */
@Component({
  selector: 'app-vehicle-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="vehicle-editor-heading" class="modal-title h5">
          {{ vehicle() ? 'Edit vehicle' : 'Add a vehicle' }}
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
          <div class="col-sm-8">
            <label class="form-label" for="vehicle-name">Name</label>
            <input
              id="vehicle-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Swift, Activa"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="vehicle-kind">Kind</label>
            <select id="vehicle-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="vehicle-make">
              Make <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="vehicle-make"
              type="text"
              class="form-control"
              formControlName="make"
              placeholder="e.g. Maruti"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="vehicle-model">
              Model <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="vehicle-model"
              type="text"
              class="form-control"
              formControlName="model"
              placeholder="e.g. Swift VXi"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="vehicle-year">
              Year <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="vehicle-year"
              type="number"
              min="1885"
              max="2200"
              step="1"
              class="form-control"
              [class.is-invalid]="fieldError('modelYear')"
              formControlName="modelYear"
              placeholder="e.g. 2021"
            />
            @if (fieldError('modelYear'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="vehicle-registration">
              Registration number <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="vehicle-registration"
              type="text"
              class="form-control text-uppercase"
              formControlName="registrationNumber"
              placeholder="e.g. MH12 AB 1234"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="vehicle-policy">Insurance</label>
            <ng-select
              labelForId="vehicle-policy"
              formControlName="insurancePolicyId"
              placeholder="Not recorded"
            >
              @for (p of policies(); track p.id) {
                <ng-option [value]="p.id">
                  {{ p.name }}{{ p.insurer ? ' — ' + p.insurer : '' }}
                </ng-option>
              }
            </ng-select>
            <div class="form-text">
              Add the policy in Finance › Insurance — its renewal is reminded there.
            </div>
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-4">
              <label class="form-label" [for]="'vehicle-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'vehicle-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="'Pick ' + d.label.toLowerCase()"
                  (click)="picker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError(d.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="form-check mb-0">
            <input
              id="vehicle-remind"
              type="checkbox"
              class="form-check-input"
              formControlName="remind"
            />
            <label class="form-check-label" for="vehicle-remind">Remind me</label>
          </div>
          <input
            type="number"
            min="0"
            max="365"
            class="form-control form-control-sm"
            style="width: 5.5rem"
            [class.is-invalid]="fieldError('reminderDays')"
            formControlName="reminderDays"
            placeholder="15"
            aria-label="Days before the PUC or registration runs out"
          />
          <span class="small">days before the PUC or registration runs out</span>
          @if (fieldError('reminderDays'); as error) {
            <div class="invalid-feedback d-block w-100">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="vehicle-price">
              Bought for <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="vehicle-price"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('purchasePrice')"
              formControlName="purchasePrice"
              placeholder="e.g. 750000"
            />
            @if (fieldError('purchasePrice'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="vehicle-currency">Currency</label>
            <ng-select
              labelForId="vehicle-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="Choose a currency"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="vehicle-fuel-unit">Fuel is measured in</label>
          <select id="vehicle-fuel-unit" class="form-select" formControlName="fuelUnit">
            @for (unit of fuelUnits; track unit) {
              <option [ngValue]="unit" [selected]="unit === form.controls.fuelUnit.value">
                {{ fuelUnitLabels[unit] }}
              </option>
            }
          </select>
          <div class="form-text">Used by the fuel log for mileage (km per litre, kg or kWh).</div>
        </div>
        <div>
          <label class="form-label" for="vehicle-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="vehicle-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Tyre pressure, the garage you trust, chassis number"
          ></textarea>
        </div>
        @if (vehicle(); as v) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the RC, PUC certificate or loan papers (from Documents).
            </p>
            <app-linked-items entityType="Vehicle" [entityId]="v.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="Vehicle" [entityId]="v.id" [entityTitle]="v.name" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (vehicle()) {
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
export class VehicleEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = VEHICLE_KINDS;
  protected readonly kindLabels = VEHICLE_KIND_LABELS;
  protected readonly fuelUnits = FUEL_UNITS;
  protected readonly fuelUnitLabels = FUEL_UNIT_LABELS;
  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 20, month: 12, day: 31 };
  protected readonly dateFields = [
    { name: 'purchasedOn', label: 'Bought on', placeholder: 'e.g. 10/Feb/2021' },
    { name: 'pucValidUntil', label: 'PUC valid until', placeholder: 'On the certificate' },
    { name: 'registrationValidUntil', label: 'Registration valid until', placeholder: 'On the RC' },
  ] as const;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly allPolicies = toSignal(
    inject(FinanceService)
      .policies()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  /** Vehicle policies first. */
  protected readonly policies = computed(() =>
    [...this.allPolicies()].sort(
      (a, b) => Number(b.kind === 'Vehicle') - Number(a.kind === 'Vehicle'),
    ),
  );
  protected readonly vehicle = signal<Vehicle | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<VehicleKind>('Car'),
    make: this.fb.nonNullable.control('', Validators.maxLength(100)),
    model: this.fb.nonNullable.control('', Validators.maxLength(100)),
    modelYear: this.fb.control<number | null>(null, [Validators.min(1885), Validators.max(2200)]),
    registrationNumber: this.fb.nonNullable.control('', Validators.maxLength(20)),
    insurancePolicyId: this.fb.control<number | null>(null),
    purchasedOn: this.fb.control<string | null>(null),
    pucValidUntil: this.fb.control<string | null>(null),
    registrationValidUntil: this.fb.control<string | null>(null),
    remind: this.fb.nonNullable.control(true),
    reminderDays: this.fb.control<number | null>(15, [Validators.min(0), Validators.max(365)]),
    purchasePrice: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    fuelUnit: this.fb.nonNullable.control<FuelUnit>('Litre'),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(vehicle?: Vehicle): void {
    this.vehicle.set(vehicle ?? null);
    this.form.reset({
      name: vehicle?.name ?? '',
      kind: vehicle?.kind ?? 'Car',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      modelYear: vehicle?.modelYear ?? null,
      registrationNumber: vehicle?.registrationNumber ?? '',
      insurancePolicyId: vehicle?.insurancePolicyId ?? null,
      purchasedOn: vehicle?.purchasedOn ?? null,
      pucValidUntil: vehicle?.pucValidUntil ?? null,
      registrationValidUntil: vehicle?.registrationValidUntil ?? null,
      remind: vehicle ? vehicle.reminderDays !== null : true,
      reminderDays: vehicle?.reminderDays ?? 15,
      purchasePrice: vehicle?.purchasePrice ?? null,
      currency: vehicle?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      fuelUnit: vehicle?.fuelUnit ?? 'Litre',
      notes: vehicle?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'modelYear'
      | 'purchasedOn'
      | 'pucValidUntil'
      | 'registrationValidUntil'
      | 'reminderDays'
      | 'purchasePrice'
      | 'currency',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Name it (e.g. Swift, Activa).' : 'That is too long.';
      case 'modelYear':
        return 'That isn’t a model year.';
      case 'reminderDays':
        return control.errors['required']
          ? 'How many days before?'
          : control.errors['needed']
            ? 'Reminders need a PUC or registration valid-until day.'
            : '0 to 365 days.';
      case 'purchasePrice':
        return 'Can’t be negative — or leave it blank.';
      case 'currency':
        return 'Choose the price’s currency.';
      case 'purchasedOn':
        return control.errors['future']
          ? 'It can’t have been bought in the future.'
          : dateFieldError(control.errors);
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    for (const control of ['purchasedOn', 'reminderDays', 'currency'] as const) {
      this.form.controls[control].updateValueAndValidity();
    }
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.purchasedOn && v.purchasedOn > today) {
      this.form.controls.purchasedOn.setErrors({ future: true });
    }
    if (v.remind && v.reminderDays === null) {
      this.form.controls.reminderDays.setErrors({ required: true });
    }
    // Reminders only make sense with a day to remind about; with neither, "remind me" is simply off.
    const remind = v.remind && (v.pucValidUntil !== null || v.registrationValidUntil !== null);
    if (v.purchasePrice !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .saveVehicle(this.vehicle()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        make: v.make.trim() || null,
        model: v.model.trim() || null,
        modelYear: v.modelYear,
        registrationNumber: v.registrationNumber.trim() || null,
        purchasedOn: v.purchasedOn,
        purchasePrice: v.purchasePrice,
        currency:
          v.purchasePrice !== null || this.vehicle()?.disposalAmount != null
            ? v.currency || null
            : null,
        insurancePolicyId: v.insurancePolicyId,
        pucValidUntil: v.pucValidUntil,
        registrationValidUntil: v.registrationValidUntil,
        reminderDays: remind ? v.reminderDays : null,
        fuelUnit: v.fuelUnit,
        notes: v.notes.trim() || null,
        today,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (vehicle) => this.activeModal.close({ kind: 'saved', vehicle }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the vehicle.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${vehicle.name}"?`,
      text: 'Its warranties and reminders go too; its maintenance and its insurance policy stay. Sold it? Use "Let go" instead to keep it in your history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeVehicle(vehicle.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the vehicle.')),
    });
  }
}
