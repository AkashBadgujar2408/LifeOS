import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { FinanceService } from '../../core/services/finance.service';
import { HomeService } from '../../core/services/home.service';
import { Purchase, PurchasesService } from '../../core/services/purchases.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { Attachments } from '../../shared/components/attachments/attachments';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { heldCurrencies } from '../finance/finance-view';

export type PurchaseEditorResult = { kind: 'saved'; purchase: Purchase } | { kind: 'deleted' };

/** What a new purchase starts from: bought from a shopping list or the wishlist. */
export interface PurchasePrefill {
  title?: string;
  store?: string | null;
  estimatedAmount?: number | null;
  amount?: number | null;
  currency?: string | null;
  shoppingListItemIds?: number[];
  wishlistItemId?: number | null;
  /** Shown above the form ("2 items from Groceries", "From your wishlist"). */
  from?: string;
}

/** Opens a purchase (new when missing). Resolves null when closed without a change. */
export async function openPurchaseEditor(
  modal: NgbModal,
  purchase?: Purchase,
  prefill?: PurchasePrefill,
): Promise<PurchaseEditorResult | null> {
  const modalRef = modal.open(PurchaseEditor, {
    ariaLabelledBy: 'purchase-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as PurchaseEditor).configure(purchase, prefill);
  try {
    return (await modalRef.result) as PurchaseEditorResult;
  } catch {
    return null;
  }
}

/**
 * A purchase. A new one can do everything in one step: record the expense in Finance, add the item to the Home
 * inventory and note its warranty (which reminds you before it runs out). Once saved: receipts, links, reminders,
 * and the expense recorded later or taken back.
 */
@Component({
  selector: 'app-purchase-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    TagPicker,
    Attachments,
    LinkedItems,
    EntityReminders,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="purchase-editor-heading" class="modal-title h5">
          {{ purchase() ? 'Purchase' : 'Record a purchase' }}
        </h2>
        <button type="button" class="btn-close" aria-label="Close" (click)="close()"></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        @if (prefill()?.from; as from) {
          <p class="small text-body-secondary mb-0">
            <i class="bi bi-info-circle" aria-hidden="true"></i> {{ from }}
          </p>
        }
        <div class="row g-3">
          <div class="col-sm-7">
            <label class="form-label" for="purchase-title">What</label>
            <input
              id="purchase-title"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('title')"
              formControlName="title"
              placeholder="e.g. Microwave, Groceries"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('title'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="purchase-store">
              Store <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="purchase-store"
              type="text"
              class="form-control"
              formControlName="store"
              placeholder="e.g. Croma, Amazon"
              autocomplete="off"
              list="purchase-stores"
            />
            <datalist id="purchase-stores">
              @for (s of stores(); track s) {
                <option [value]="s"></option>
              }
            </datalist>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="purchase-on">Bought on</label>
            <div class="input-group">
              <input
                id="purchase-on"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('purchasedOn')"
                formControlName="purchasedOn"
                placeholder="e.g. 20/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #onPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="onPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('purchasedOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-3">
            <label class="form-label" for="purchase-amount">Paid</label>
            <input
              id="purchase-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 12990"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-2">
            <label class="form-label" for="purchase-currency">Currency</label>
            <select
              id="purchase-currency"
              class="form-select"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
            >
              @for (c of currencies(); track c.code) {
                <option [ngValue]="c.code" [selected]="c.code === form.controls.currency.value">
                  {{ c.code }}
                </option>
              }
            </select>
          </div>
          <div class="col-sm-3">
            <label class="form-label" for="purchase-estimate">
              Expected <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="purchase-estimate"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('estimatedAmount')"
              formControlName="estimatedAmount"
              placeholder="What you planned"
            />
            @if (fieldError('estimatedAmount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        @if (lockedReason(); as reason) {
          <p class="small text-body-secondary mb-0">{{ reason }}</p>
        }
        <div>
          <span class="form-label d-block">Categories</span>
          <app-tag-picker [selectedTagIds]="tagIds()" (selectedTagIdsChange)="tagIds.set($event)" />
        </div>

        <section class="border-top pt-3" aria-labelledby="purchase-finance">
          <h3 id="purchase-finance" class="h6">Finance</h3>
          @if (purchase()?.transactionId) {
            <p class="small mb-0">
              <i class="bi bi-check2-circle text-success" aria-hidden="true"></i>
              Recorded as an expense{{
                purchase()?.paidFromAccountName ? ' from ' + purchase()?.paidFromAccountName : ''
              }}.
              <button
                type="button"
                class="btn btn-link btn-sm p-0 align-baseline"
                (click)="takeBackExpense()"
              >
                Take the expense back
              </button>
            </p>
          } @else {
            <div class="row g-3">
              <div class="col-sm-6">
                <label class="form-label" for="purchase-account">Paid from</label>
                <select id="purchase-account" class="form-select" formControlName="accountId">
                  <option [ngValue]="null" [selected]="form.controls.accountId.value === null">
                    Don't record it in Finance
                  </option>
                  @for (a of payableAccounts(); track a.id) {
                    <option [ngValue]="a.id" [selected]="a.id === form.controls.accountId.value">
                      {{ a.name }}
                    </option>
                  }
                </select>
              </div>
              @if (needsRate() && form.controls.accountId.value !== null) {
                <div class="col-sm-6">
                  <label class="form-label" for="purchase-rate">
                    Rate to {{ baseCurrency() }}
                    <span class="text-body-secondary small"
                      >(1 {{ form.controls.currency.value }} =)</span
                    >
                  </label>
                  <input
                    id="purchase-rate"
                    type="number"
                    step="0.000001"
                    min="0"
                    class="form-control"
                    [class.is-invalid]="fieldError('exchangeRate')"
                    formControlName="exchangeRate"
                    placeholder="e.g. 84"
                  />
                  @if (fieldError('exchangeRate'); as error) {
                    <div class="invalid-feedback d-block">{{ error }}</div>
                  }
                </div>
              }
            </div>
            <div class="form-text">
              An account adds one expense to your ledger, with these categories.
            </div>
          }
        </section>

        @if (!purchase()) {
          <section class="border-top pt-3" aria-labelledby="purchase-home">
            <h3 id="purchase-home" class="h6">Home</h3>
            <div class="form-check">
              <input
                id="purchase-add-asset"
                type="checkbox"
                class="form-check-input"
                formControlName="addAsset"
              />
              <label class="form-check-label" for="purchase-add-asset">
                Add it to my inventory
              </label>
            </div>
            @if (form.controls.addAsset.value) {
              <div class="row g-3 mt-0">
                <div class="col-sm-6">
                  <label class="form-label" for="purchase-property">Where</label>
                  <select id="purchase-property" class="form-select" formControlName="propertyId">
                    <option [ngValue]="null" [selected]="form.controls.propertyId.value === null">
                      No property
                    </option>
                    @for (p of properties(); track p.id) {
                      <option [ngValue]="p.id" [selected]="p.id === form.controls.propertyId.value">
                        {{ p.name }}
                      </option>
                    }
                  </select>
                </div>
                <div class="col-sm-6">
                  <label class="form-label" for="purchase-room">
                    Room <span class="text-body-secondary small">(optional)</span>
                  </label>
                  <input
                    id="purchase-room"
                    type="text"
                    class="form-control"
                    formControlName="room"
                    placeholder="e.g. Kitchen"
                  />
                </div>
                <div class="col-sm-4">
                  <label class="form-label" for="purchase-brand">
                    Brand <span class="text-body-secondary small">(optional)</span>
                  </label>
                  <input
                    id="purchase-brand"
                    type="text"
                    class="form-control"
                    formControlName="brand"
                    placeholder="e.g. LG"
                  />
                </div>
                <div class="col-sm-4">
                  <label class="form-label" for="purchase-model">
                    Model <span class="text-body-secondary small">(optional)</span>
                  </label>
                  <input
                    id="purchase-model"
                    type="text"
                    class="form-control"
                    formControlName="model"
                    placeholder="e.g. MC2846"
                  />
                </div>
                <div class="col-sm-4">
                  <label class="form-label" for="purchase-serial">
                    Serial no. <span class="text-body-secondary small">(optional)</span>
                  </label>
                  <input
                    id="purchase-serial"
                    type="text"
                    class="form-control"
                    formControlName="serialNumber"
                    placeholder="On the sticker"
                  />
                </div>
              </div>
              <div class="form-check mt-3">
                <input
                  id="purchase-add-warranty"
                  type="checkbox"
                  class="form-check-input"
                  formControlName="addWarranty"
                />
                <label class="form-check-label" for="purchase-add-warranty">
                  It came with a warranty
                </label>
              </div>
              @if (form.controls.addWarranty.value) {
                <div class="row g-3 mt-0">
                  <div class="col-sm-4">
                    <label class="form-label" for="purchase-warranty-kind">Cover</label>
                    <select
                      id="purchase-warranty-kind"
                      class="form-select"
                      formControlName="warrantyKind"
                    >
                      @for (k of warrantyKinds; track k.value) {
                        <option
                          [ngValue]="k.value"
                          [selected]="k.value === form.controls.warrantyKind.value"
                        >
                          {{ k.label }}
                        </option>
                      }
                    </select>
                  </div>
                  <div class="col-sm-4">
                    <label class="form-label" for="purchase-warranty-until">Runs out on</label>
                    <div class="input-group">
                      <input
                        id="purchase-warranty-until"
                        type="text"
                        class="form-control"
                        [class.is-invalid]="fieldError('warrantyExpiresOn')"
                        formControlName="warrantyExpiresOn"
                        placeholder="e.g. 20/Oct/2027"
                        autocomplete="off"
                        ngbDatepicker
                        #warrantyPicker="ngbDatepicker"
                        container="body"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-secondary"
                        aria-label="Pick the day the warranty runs out"
                        (click)="warrantyPicker.toggle()"
                      >
                        <i class="bi bi-calendar3"></i>
                      </button>
                    </div>
                    @if (fieldError('warrantyExpiresOn'); as error) {
                      <div class="invalid-feedback d-block">{{ error }}</div>
                    }
                  </div>
                  <div class="col-sm-4">
                    <label class="form-label" for="purchase-warranty-remind">Remind me</label>
                    <div class="input-group">
                      <input
                        id="purchase-warranty-remind"
                        type="number"
                        min="0"
                        max="365"
                        class="form-control"
                        [class.is-invalid]="fieldError('warrantyReminderDays')"
                        formControlName="warrantyReminderDays"
                        placeholder="e.g. 30"
                      />
                      <span class="input-group-text">days before</span>
                    </div>
                    @if (fieldError('warrantyReminderDays'); as error) {
                      <div class="invalid-feedback d-block">{{ error }}</div>
                    }
                  </div>
                </div>
              }
            }
          </section>
        } @else if (purchase()?.assetName; as assetName) {
          <p class="small mb-0 border-top pt-3">
            <i class="bi bi-box-seam" aria-hidden="true"></i> In your inventory as
            <strong>{{ assetName }}</strong> — its warranty and photos live there.
          </p>
        }

        <div>
          <label class="form-label" for="purchase-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="purchase-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Order number, what was included"
          ></textarea>
        </div>
        @if (purchase(); as p) {
          <div class="border-top pt-3">
            <app-attachments entityType="Purchase" [entityId]="p.id" label="Receipts" />
          </div>
          <div class="border-top pt-3">
            <app-linked-items entityType="Purchase" [entityId]="p.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders entityType="Purchase" [entityId]="p.id" [entityTitle]="p.title" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (purchase()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class PurchaseEditor {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly warrantyKinds = [
    { value: 'Warranty', label: 'Warranty' },
    { value: 'Extended', label: 'Extended warranty' },
    { value: 'AMC', label: 'AMC' },
  ] as const;
  protected readonly purchase = signal<Purchase | null>(null);
  protected readonly prefill = signal<PurchasePrefill | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);
  /** The expense was taken back while open: the list needs a reload even on Cancel. */
  private changed = false;

  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  private readonly accounts = toSignal(
    inject(FinanceService)
      .accounts()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly properties = toSignal(
    inject(HomeService)
      .properties()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly stores = toSignal(
    this.purchasesService.stores().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly baseCurrency = computed(() => this.settingsService.settings()?.baseCurrency);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    store: this.fb.nonNullable.control('', Validators.maxLength(200)),
    purchasedOn: this.fb.control<string | null>(todayIso(), Validators.required),
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    estimatedAmount: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control('', Validators.required),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    accountId: this.fb.control<number | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0.000001)),
    addAsset: this.fb.nonNullable.control(false),
    propertyId: this.fb.control<number | null>(null),
    room: this.fb.nonNullable.control('', Validators.maxLength(100)),
    brand: this.fb.nonNullable.control('', Validators.maxLength(100)),
    model: this.fb.nonNullable.control('', Validators.maxLength(100)),
    serialNumber: this.fb.nonNullable.control('', Validators.maxLength(100)),
    addWarranty: this.fb.nonNullable.control(false),
    warrantyKind: this.fb.nonNullable.control<'Warranty' | 'Extended' | 'AMC'>('Warranty'),
    warrantyExpiresOn: this.fb.control<string | null>(null),
    warrantyReminderDays: this.fb.control<number | null>(30, [
      Validators.min(0),
      Validators.max(365),
    ]),
  });

  private readonly currency = toSignal(this.form.controls.currency.valueChanges, {
    initialValue: '',
  });
  protected readonly needsRate = computed(
    () => !!this.currency() && !!this.baseCurrency() && this.currency() !== this.baseCurrency(),
  );
  protected readonly payableAccounts = computed(() =>
    this.accounts().filter(
      (a) => !a.isArchived && (!this.currency() || heldCurrencies(a).includes(this.currency())),
    ),
  );
  protected readonly lockedReason = computed(() =>
    this.purchase()?.transactionId
      ? 'What you paid and the day are in Finance — take the expense back to change them.'
      : null,
  );

  configure(purchase?: Purchase, prefill?: PurchasePrefill): void {
    this.purchase.set(purchase ?? null);
    this.prefill.set(prefill ?? null);
    this.tagIds.set(purchase?.tags.map((t) => t.id) ?? []);
    const base = this.settingsService.settings()?.baseCurrency ?? 'INR';
    this.form.reset({
      title: purchase?.title ?? prefill?.title ?? '',
      store: purchase?.store ?? prefill?.store ?? '',
      purchasedOn: purchase?.purchasedOn ?? todayIso(),
      amount: purchase?.amount ?? prefill?.amount ?? null,
      estimatedAmount: purchase?.estimatedAmount ?? prefill?.estimatedAmount ?? null,
      currency: purchase?.currency ?? prefill?.currency ?? base,
      notes: purchase?.notes ?? '',
      accountId: null,
      exchangeRate: null,
      addAsset: false,
      propertyId: null,
      room: '',
      brand: '',
      model: '',
      serialNumber: '',
      addWarranty: false,
      warrantyKind: 'Warranty',
      warrantyExpiresOn: null,
      warrantyReminderDays: 30,
    });
    if (purchase?.transactionId) {
      this.form.controls.amount.disable();
      this.form.controls.currency.disable();
      this.form.controls.purchasedOn.disable();
    }
  }

  protected fieldError(
    name:
      | 'title'
      | 'purchasedOn'
      | 'amount'
      | 'estimatedAmount'
      | 'currency'
      | 'exchangeRate'
      | 'warrantyExpiresOn'
      | 'warrantyReminderDays',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'title':
        return control.errors['required'] ? 'Say what you bought.' : 'That is too long.';
      case 'purchasedOn':
        return control.errors['required']
          ? 'Say when you bought it.'
          : control.errors['future']
            ? 'It can’t be bought in the future.'
            : dateFieldError(control.errors);
      case 'amount':
        return control.errors['required']
          ? 'Give what you paid (0 if it was free).'
          : 'Can’t be negative.';
      case 'estimatedAmount':
        return 'Can’t be negative.';
      case 'currency':
        return 'Choose the currency.';
      case 'exchangeRate':
        return 'Give the rate — or don’t record it in Finance.';
      case 'warrantyExpiresOn':
        return control.errors['required']
          ? 'Say when the warranty runs out.'
          : control.errors['early']
            ? 'It can’t run out before you bought it.'
            : dateFieldError(control.errors);
      case 'warrantyReminderDays':
        return '0 to 365 days.';
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    const v = this.form.getRawValue();
    const today = todayIso();
    const existing = this.purchase();
    this.form.controls.purchasedOn.updateValueAndValidity();
    this.form.controls.exchangeRate.updateValueAndValidity();
    this.form.controls.warrantyExpiresOn.updateValueAndValidity();
    if (v.purchasedOn && v.purchasedOn > today && !existing?.transactionId) {
      this.form.controls.purchasedOn.setErrors({ future: true });
    }
    const recording = !existing?.transactionId && v.accountId !== null;
    if (recording && this.needsRate() && v.exchangeRate === null) {
      this.form.controls.exchangeRate.setErrors({ required: true });
    }
    const warranty = !existing && v.addAsset && v.addWarranty;
    if (warranty && !v.warrantyExpiresOn) {
      this.form.controls.warrantyExpiresOn.setErrors({ required: true });
    } else if (warranty && v.purchasedOn && v.warrantyExpiresOn! < v.purchasedOn) {
      this.form.controls.warrantyExpiresOn.setErrors({ early: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const expense = recording
      ? { accountId: v.accountId!, exchangeRate: this.needsRate() ? v.exchangeRate : null }
      : null;
    this.saving.set(true);
    const prefill = this.prefill();
    const save = this.purchasesService.savePurchase(existing?.id ?? null, {
      title: v.title,
      store: v.store.trim() || null,
      purchasedOn: v.purchasedOn!,
      amount: v.amount!,
      estimatedAmount: v.estimatedAmount,
      currency: v.currency,
      notes: v.notes.trim() || null,
      tagIds: this.tagIds(),
      expense: existing ? null : expense,
      asset:
        !existing && v.addAsset
          ? {
              name: null,
              propertyId: v.propertyId,
              room: v.room.trim() || null,
              brand: v.brand.trim() || null,
              model: v.model.trim() || null,
              serialNumber: v.serialNumber.trim() || null,
              quantity: 1,
            }
          : null,
      warranty: warranty
        ? {
            kind: v.warrantyKind,
            provider: v.brand.trim() || null,
            expiresOn: v.warrantyExpiresOn!,
            reminderDays: v.warrantyReminderDays,
          }
        : null,
      shoppingListItemIds: existing ? [] : (prefill?.shoppingListItemIds ?? []),
      wishlistItemId: existing ? null : (prefill?.wishlistItemId ?? null),
      today,
    });
    save.subscribe({
      next: (saved) => {
        // An existing purchase not yet in Finance records its expense after the save.
        if (existing && expense) {
          this.purchasesService.recordPurchaseExpense(saved.id, expense).subscribe({
            next: (recorded) => this.activeModal.close({ kind: 'saved', purchase: recorded }),
            error: (err) => {
              this.saving.set(false);
              this.toast.error(apiErrorMessage(err, 'Saved, but could not record the expense.'));
            },
          });
          return;
        }
        this.activeModal.close({ kind: 'saved', purchase: saved });
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the purchase.'));
      },
    });
  }

  protected async takeBackExpense(): Promise<void> {
    const purchase = this.purchase();
    if (!purchase) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Take the expense back?',
      text: 'The expense this purchase created is deleted from your ledger. The purchase stays.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Take it back',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removePurchaseExpense(purchase.id).subscribe({
      next: (updated) => {
        this.changed = true;
        this.configure(updated, this.prefill() ?? undefined);
        this.form.controls.amount.enable();
        this.form.controls.currency.enable();
        this.form.controls.purchasedOn.enable();
        this.toast.success('Expense taken back.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take the expense back.')),
    });
  }

  protected async remove(): Promise<void> {
    const purchase = this.purchase();
    if (!purchase) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${purchase.title}"?`,
      text: purchase.transactionId
        ? 'Its expense in Finance is deleted too. The item it became stays in your inventory.'
        : 'The item it became (if any) stays in your inventory.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removePurchase(purchase.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the purchase.')),
    });
  }

  protected close(): void {
    const purchase = this.purchase();
    if (this.changed && purchase) {
      this.activeModal.close({ kind: 'saved', purchase });
    } else {
      this.activeModal.dismiss();
    }
  }
}
