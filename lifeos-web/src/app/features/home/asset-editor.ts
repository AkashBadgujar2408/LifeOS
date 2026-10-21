import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { DatePipe } from '@angular/common';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Asset, HomeService } from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Attachments } from '../../shared/components/attachments/attachments';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { formatMoney } from '../finance/finance-view';
import { DISPOSAL_KIND_LABELS, knownRooms } from './home-view';

export type AssetEditorResult = { kind: 'saved'; asset: Asset } | { kind: 'deleted' };

export interface AssetEditorOptions {
  /** A new item starts in this property / room (adding from a room group). */
  propertyId?: number | null;
  room?: string | null;
}

/** Opens an inventory item (new when missing); resolves with what happened, or null if dismissed. */
export async function openAssetEditor(
  modal: NgbModal,
  asset?: Asset,
  options: AssetEditorOptions = {},
): Promise<AssetEditorResult | null> {
  const modalRef = modal.open(AssetEditor, { ariaLabelledBy: 'asset-editor-heading', size: 'lg' });
  (modalRef.componentInstance as AssetEditor).configure(asset, options);
  try {
    return (await modalRef.result) as AssetEditorResult;
  } catch {
    return null;
  }
}

/**
 * Something you own: where it is, what it is, when and for how much it was bought, its categories (tags) — and, once
 * saved, photos and receipts, linked manuals or bills, reminders. Letting it go is on the inventory page.
 */
@Component({
  selector: 'app-asset-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    DatePipe,
    TagPicker,
    LinkedItems,
    EntityReminders,
    Attachments,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="asset-editor-heading" class="modal-title h5">
          {{ asset() ? 'Edit item' : 'Add to your inventory' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (asset()?.disposedOn; as disposedOn) {
          <div class="alert alert-secondary small mb-0">
            {{ disposalLabels[asset()!.disposalKind!] }} on {{ disposedOn | date }}
            @if (asset()!.disposalAmount !== null && asset()!.currency) {
              for {{ money(asset()!.disposalAmount!, asset()!.currency!) }}
            }
            — it's kept in your history, not in the inventory.
          </div>
        }
        <div class="row g-3">
          <div class="col-sm-8">
            <label class="form-label" for="asset-name">Name</label>
            <input
              id="asset-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Fridge, Work laptop"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="asset-quantity">How many</label>
            <input
              id="asset-quantity"
              type="number"
              min="1"
              max="10000"
              step="1"
              class="form-control"
              [class.is-invalid]="fieldError('quantity')"
              formControlName="quantity"
              placeholder="1"
            />
            @if (fieldError('quantity'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="asset-property">Where</label>
            <ng-select
              labelForId="asset-property"
              formControlName="propertyId"
              placeholder="Not at a property"
            >
              @for (p of properties(); track p.id) {
                <ng-option [value]="p.id">
                  {{ p.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="asset-room">
              Room <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="asset-room"
              type="text"
              class="form-control"
              formControlName="room"
              placeholder="e.g. Kitchen"
              autocomplete="off"
              list="asset-rooms"
            />
            <datalist id="asset-rooms">
              @for (room of rooms(); track room) {
                <option [value]="room"></option>
              }
            </datalist>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="asset-brand">
              Brand <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="asset-brand"
              type="text"
              class="form-control"
              formControlName="brand"
              placeholder="e.g. LG"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="asset-model">
              Model <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="asset-model"
              type="text"
              class="form-control"
              formControlName="model"
              placeholder="e.g. GL-T292"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="asset-serial">
              Serial number <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="asset-serial"
              type="text"
              class="form-control"
              formControlName="serialNumber"
              placeholder="On the sticker at the back"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="asset-bought">Bought on</label>
            <div class="input-group">
              <input
                id="asset-bought"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('purchasedOn')"
                formControlName="purchasedOn"
                placeholder="e.g. 01/May/2022"
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
                aria-label="Pick the purchase day"
                (click)="picker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('purchasedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="asset-price">
              Price <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="asset-price"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('purchasePrice')"
              formControlName="purchasePrice"
              placeholder="e.g. 42000"
            />
            @if (fieldError('purchasePrice'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="asset-currency">Currency</label>
            <ng-select
              labelForId="asset-currency"
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
          <span class="form-label d-block">Categories</span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>
        <div>
          <label class="form-label" for="asset-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="asset-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Where the manual is, the service centre, what to watch for"
          ></textarea>
        </div>
        @if (asset(); as a) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">Photos, the bill or the box label.</p>
            <app-attachments entityType="Asset" [entityId]="a.id" [photos]="true" />
          </div>
          <div class="border-top pt-3">
            <app-linked-items entityType="Asset" [entityId]="a.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="Asset" [entityId]="a.id" [entityTitle]="a.name" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (asset()) {
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
export class AssetEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly disposalLabels = DISPOSAL_KIND_LABELS;
  protected readonly money = formatMoney;
  protected readonly minDate = { year: 1950, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 1, month: 12, day: 31 };
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly properties = toSignal(
    this.homeService.properties().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly allAssets = toSignal(
    this.homeService.assets(true).pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly asset = signal<Asset | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    quantity: this.fb.control<number | null>(1, [
      Validators.required,
      Validators.min(1),
      Validators.max(10000),
    ]),
    propertyId: this.fb.control<number | null>(null),
    room: this.fb.nonNullable.control('', Validators.maxLength(100)),
    brand: this.fb.nonNullable.control('', Validators.maxLength(100)),
    model: this.fb.nonNullable.control('', Validators.maxLength(100)),
    serialNumber: this.fb.nonNullable.control('', Validators.maxLength(100)),
    purchasedOn: this.fb.control<string | null>(null),
    purchasePrice: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  private readonly propertyId = toSignal(this.form.controls.propertyId.valueChanges, {
    initialValue: null,
  });

  /** Rooms already used at the chosen property, as suggestions. */
  protected readonly rooms = computed(() =>
    knownRooms(this.allAssets(), this.propertyId() ?? null),
  );

  configure(asset?: Asset, options: AssetEditorOptions = {}): void {
    this.asset.set(asset ?? null);
    this.tagIds.set(asset?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      name: asset?.name ?? '',
      quantity: asset?.quantity ?? 1,
      propertyId: asset ? asset.propertyId : (options.propertyId ?? null),
      room: asset ? (asset.room ?? '') : (options.room ?? ''),
      brand: asset?.brand ?? '',
      model: asset?.model ?? '',
      serialNumber: asset?.serialNumber ?? '',
      purchasedOn: asset?.purchasedOn ?? null,
      purchasePrice: asset?.purchasePrice ?? null,
      currency: asset?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      notes: asset?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'name' | 'quantity' | 'purchasedOn' | 'purchasePrice' | 'currency',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required']
          ? 'Name it (e.g. Fridge, Work laptop).'
          : 'That is too long.';
      case 'quantity':
        return '1 to 10,000.';
      case 'purchasePrice':
        return 'Can’t be negative — or leave it blank.';
      case 'currency':
        return 'Choose the price’s currency.';
      default:
        return control.errors['future']
          ? 'It can’t have been bought in the future.'
          : dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    this.form.controls.purchasedOn.updateValueAndValidity();
    this.form.controls.currency.updateValueAndValidity();
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.purchasedOn && v.purchasedOn > today) {
      this.form.controls.purchasedOn.setErrors({ future: true });
    }
    if (v.purchasePrice !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .saveAsset(this.asset()?.id ?? null, {
        name: v.name,
        propertyId: v.propertyId,
        room: v.room.trim() || null,
        brand: v.brand.trim() || null,
        model: v.model.trim() || null,
        serialNumber: v.serialNumber.trim() || null,
        quantity: v.quantity ?? 1,
        purchasedOn: v.purchasedOn,
        purchasePrice: v.purchasePrice,
        // Kept when something was sold for an amount (that amount is in it too).
        currency:
          v.purchasePrice !== null || this.asset()?.disposalAmount != null
            ? v.currency || null
            : null,
        notes: v.notes.trim() || null,
        tagIds: this.tagIds(),
        today,
      })
      .subscribe({
        next: (asset) => this.activeModal.close({ kind: 'saved', asset }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the item.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const asset = this.asset();
    if (!asset) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${asset.name}"?`,
      text: 'Deleting forgets it ever existed, with its warranties and photos. Sold or gave it away? Use "Let go" instead to keep it in your history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeAsset(asset.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the item.')),
    });
  }
}
