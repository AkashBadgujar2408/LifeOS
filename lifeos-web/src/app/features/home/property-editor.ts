import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  HomeService,
  OWNERSHIPS,
  Ownership,
  PROPERTY_KINDS,
  Property,
  PropertyKind,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { OWNERSHIP_LABELS, PROPERTY_KIND_LABELS } from './home-view';

export type PropertyEditorResult = { kind: 'saved'; property: Property } | { kind: 'deleted' };

/** Opens a property (new when missing); resolves with what happened, or null if dismissed. */
export async function openPropertyEditor(
  modal: NgbModal,
  property?: Property,
): Promise<PropertyEditorResult | null> {
  const modalRef = modal.open(PropertyEditor, {
    ariaLabelledBy: 'property-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as PropertyEditor).configure(property);
  try {
    return (await modalRef.result) as PropertyEditorResult;
  } catch {
    return null;
  }
}

/** A home (or land, an office) you own, rent or stay in — and, once saved, its deed or rent agreement linked. */
@Component({
  selector: 'app-property-editor',
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
        <h2 id="property-editor-heading" class="modal-title h5">
          {{ property() ? 'Edit property' : 'Add a property' }}
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
            <label class="form-label" for="property-name">Name</label>
            <input
              id="property-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Flat 4B, Pune"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="property-kind">Kind</label>
            <select id="property-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="property-ownership">It's</label>
            <select id="property-ownership" class="form-select" formControlName="ownership">
              @for (o of ownerships; track o) {
                <option [ngValue]="o" [selected]="o === form.controls.ownership.value">
                  {{ ownershipLabels[o] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div>
          <label class="form-label" for="property-address">
            Address <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="property-address"
            class="form-control"
            rows="2"
            formControlName="address"
            placeholder="Street, area, city"
          ></textarea>
        </div>
        <div class="row g-3">
          @for (d of dateFields(); track d.name) {
            <div class="col-sm-4">
              <label class="form-label" [for]="'property-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'property-' + d.name"
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
        @if (form.controls.ownership.value === 'Owned') {
          <div class="row g-3">
            <div class="col-sm-6">
              <label class="form-label" for="property-price">
                Bought for <span class="text-body-secondary small">(optional)</span>
              </label>
              <input
                id="property-price"
                type="number"
                step="0.01"
                min="0"
                class="form-control"
                [class.is-invalid]="fieldError('purchasePrice')"
                formControlName="purchasePrice"
                placeholder="e.g. 6500000"
              />
              @if (fieldError('purchasePrice'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div class="col-sm-6">
              <label class="form-label" for="property-currency">Currency</label>
              <ng-select
                labelForId="property-currency"
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
        }
        <div>
          <label class="form-label" for="property-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="property-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Landlord's number, society office hours, meter numbers"
          ></textarea>
        </div>
        @if (property(); as p) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the deed, rent agreement or society papers (from Documents).
            </p>
            <app-linked-items entityType="Property" [entityId]="p.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="Property" [entityId]="p.id" [entityTitle]="p.name" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (property()) {
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
export class PropertyEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = PROPERTY_KINDS;
  protected readonly kindLabels = PROPERTY_KIND_LABELS;
  protected readonly ownerships = OWNERSHIPS;
  protected readonly ownershipLabels = OWNERSHIP_LABELS;
  protected readonly minDate = { year: 1940, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 5, month: 12, day: 31 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly property = signal<Property | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<PropertyKind>('Apartment'),
    ownership: this.fb.nonNullable.control<Ownership>('Owned'),
    address: this.fb.nonNullable.control('', Validators.maxLength(500)),
    movedInOn: this.fb.control<string | null>(null),
    movedOutOn: this.fb.control<string | null>(null),
    purchasedOn: this.fb.control<string | null>(null),
    purchasePrice: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  private readonly ownership = toSignal(this.form.controls.ownership.valueChanges, {
    initialValue: this.form.controls.ownership.value,
  });

  /** "Bought on" only for a property you own. */
  protected readonly dateFields = computed(() => {
    const fields: {
      name: 'movedInOn' | 'movedOutOn' | 'purchasedOn';
      label: string;
      placeholder: string;
    }[] = [
      { name: 'movedInOn', label: 'Moved in', placeholder: 'e.g. 01/Mar/2020' },
      { name: 'movedOutOn', label: 'Moved out', placeholder: 'Blank while you live there' },
    ];
    if (this.ownership() === 'Owned') {
      fields.push({ name: 'purchasedOn', label: 'Bought on', placeholder: 'e.g. 15/Jan/2020' });
    }
    return fields;
  });

  configure(property?: Property): void {
    this.property.set(property ?? null);
    this.form.reset({
      name: property?.name ?? '',
      kind: property?.kind ?? 'Apartment',
      ownership: property?.ownership ?? 'Owned',
      address: property?.address ?? '',
      movedInOn: property?.movedInOn ?? null,
      movedOutOn: property?.movedOutOn ?? null,
      purchasedOn: property?.purchasedOn ?? null,
      purchasePrice: property?.purchasePrice ?? null,
      currency: property?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      notes: property?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'name' | 'movedInOn' | 'movedOutOn' | 'purchasedOn' | 'purchasePrice' | 'currency',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required']
          ? 'Name the property (e.g. Flat 4B, Pune).'
          : 'That is too long.';
      case 'purchasePrice':
        return 'Has to be more than zero — or leave it blank.';
      case 'currency':
        return 'Choose the price’s currency.';
      case 'movedOutOn':
        return control.errors['order']
          ? 'You can’t move out before you moved in.'
          : dateFieldError(control.errors);
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    this.form.controls.movedOutOn.updateValueAndValidity();
    this.form.controls.currency.updateValueAndValidity();
    const v = this.form.getRawValue();
    const owned = v.ownership === 'Owned';
    if (v.movedInOn && v.movedOutOn && v.movedOutOn < v.movedInOn) {
      this.form.controls.movedOutOn.setErrors({ order: true });
    }
    if (owned && v.purchasePrice !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .saveProperty(this.property()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        ownership: v.ownership,
        address: v.address.trim() || null,
        movedInOn: v.movedInOn,
        movedOutOn: v.movedOutOn,
        // Only an owned property has a purchase; switching away from Owned drops it.
        purchasedOn: owned ? v.purchasedOn : null,
        purchasePrice: owned ? v.purchasePrice : null,
        currency: owned && v.purchasePrice !== null ? v.currency : null,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: (property) => this.activeModal.close({ kind: 'saved', property }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the property.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const property = this.property();
    if (!property) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${property.name}"?`,
      text: 'Its belongings, bills and maintenance stay (just no longer tied to it). Warranties on the property itself go.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeProperty(property.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the property.')),
    });
  }
}
