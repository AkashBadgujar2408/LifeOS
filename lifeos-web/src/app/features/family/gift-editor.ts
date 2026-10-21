import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  FamilyLogService,
  GiftIdea,
  GiftStatus,
  OccasionOption,
} from '../../core/services/family-log.service';
import { Purchase, PurchasesService } from '../../core/services/purchases.service';
import { ToastService } from '../../core/services/toast.service';
import { GIFT_STATUSES } from './family-log-view';

export type GiftEditorResult = { kind: 'saved'; gift: GiftIdea } | { kind: 'deleted' };

/** Opens the gift dialog for someone (new when `gift` is missing). Resolves with what happened, or null. */
export async function openGiftEditor(
  modal: NgbModal,
  contactId: number,
  contactName: string,
  gift?: GiftIdea,
): Promise<GiftEditorResult | null> {
  const modalRef = modal.open(GiftEditor, { ariaLabelledBy: 'gift-editor-heading' });
  (modalRef.componentInstance as GiftEditor).configure(contactId, contactName, gift);
  try {
    return (await modalRef.result) as GiftEditorResult;
  } catch {
    return null;
  }
}

/** URL check kept in step with the API's FamilyLogRules.IsWebAddress (http/https only). */
function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host.length > 0;
  } catch {
    return false;
  }
}

/**
 * A gift for someone: an idea, then bought, then given. Money isn't kept on the gift — a bought one can point at the
 * purchase that paid for it (and its Finance expense); the estimate is only what the idea might cost.
 */
@Component({
  selector: 'app-gift-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NgbInputDatepicker,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="gift-editor-heading" class="modal-title h5">
          {{ gift() ? 'Gift for ' + contactName() : 'A gift for ' + contactName() }}
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
          <label class="form-label" for="gift-title">What</label>
          <input
            id="gift-title"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('title')"
            formControlName="title"
            placeholder="e.g. A pashmina shawl"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('title'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        <div>
          <span class="form-label d-block">Where it stands</span>
          <div class="btn-group" role="group" aria-label="Where the gift stands">
            @for (s of statuses; track s.value) {
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="form.controls.status.value === s.value"
                [class.btn-outline-secondary]="form.controls.status.value !== s.value"
                [attr.aria-pressed]="form.controls.status.value === s.value"
                (click)="setStatus(s.value)"
              >
                <i class="bi {{ s.icon }}"></i> {{ s.label }}
              </button>
            }
          </div>
        </div>

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="gift-occasion-date">Occasion</label>
            <select id="gift-occasion-date" class="form-select" formControlName="significantDateId">
              <option [ngValue]="null" [selected]="form.controls.significantDateId.value === null">
                {{ occasions().length ? 'Something else (type it)' : 'Type it below' }}
              </option>
              @for (o of occasions(); track o.id) {
                <option
                  [ngValue]="o.id"
                  [selected]="o.id === form.controls.significantDateId.value"
                >
                  {{ o.title }}
                </option>
              }
            </select>
          </div>
          @if (form.controls.significantDateId.value === null) {
            <div class="col-sm-6">
              <label class="form-label" for="gift-occasion">
                Occasion <span class="text-body-secondary small">(optional)</span>
              </label>
              <input
                id="gift-occasion"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('occasion')"
                formControlName="occasion"
                placeholder="e.g. Diwali, housewarming"
                autocomplete="off"
              />
              @if (fieldError('occasion'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>

        <div class="row g-3">
          <div class="col-7">
            <label class="form-label" for="gift-amount">
              Might cost <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="gift-amount"
              type="number"
              min="0"
              step="any"
              class="form-control"
              [class.is-invalid]="moneyError()"
              formControlName="estimatedAmount"
              placeholder="e.g. 2500"
            />
            @if (moneyError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-5">
            <label class="form-label" for="gift-currency">Currency</label>
            <input
              id="gift-currency"
              type="text"
              class="form-control text-uppercase"
              [class.is-invalid]="currencyError()"
              formControlName="currency"
              placeholder="e.g. INR"
              maxlength="3"
              autocomplete="off"
            />
            @if (currencyError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>

        <div>
          <label class="form-label" for="gift-link">
            Link <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="gift-link"
            type="url"
            class="form-control"
            [class.is-invalid]="fieldError('link')"
            formControlName="link"
            placeholder="https://…"
            autocomplete="off"
          />
          @if (fieldError('link'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        @if (form.controls.status.value !== 'Idea') {
          <div>
            <label class="form-label" for="gift-purchase">
              Bought with <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="gift-purchase"
              formControlName="purchaseId"
              placeholder="Not recorded in Purchases"
            >
              @for (p of purchases(); track p.id) {
                <ng-option [value]="p.id"> {{ p.title }} · {{ p.purchasedOn | date }} </ng-option>
              }
            </ng-select>
            <div class="form-text">
              The money lives with the purchase (and its expense in Finance), never on the gift.
            </div>
          </div>
        }

        @if (form.controls.status.value === 'Given') {
          <div>
            <label class="form-label" for="gift-given">Given on</label>
            <div class="input-group">
              <input
                id="gift-given"
                type="text"
                class="form-control"
                [class.is-invalid]="givenError()"
                formControlName="givenOn"
                placeholder="e.g. 21/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #givenPicker="ngbDatepicker"
                [minDate]="minDate"
                container="body"
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day it was given"
                (click)="givenPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (givenError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }

        <div>
          <label class="form-label" for="gift-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="gift-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="Size, colour, where to find it"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="modal-footer">
        @if (gift()) {
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
export class GiftEditor {
  private readonly fb = inject(FormBuilder);
  private readonly familyLog = inject(FamilyLogService);
  private readonly purchasesService = inject(PurchasesService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly statuses = GIFT_STATUSES;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly gift = signal<GiftIdea | null>(null);
  protected readonly contactName = signal('');
  protected readonly occasions = signal<OccasionOption[]>([]);
  protected readonly purchases = signal<Purchase[]>([]);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  private contactId = 0;

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    status: this.fb.nonNullable.control<GiftStatus>('Idea'),
    significantDateId: this.fb.control<number | null>(null),
    occasion: this.fb.nonNullable.control('', Validators.maxLength(100)),
    estimatedAmount: this.fb.control<number | null>(null, Validators.min(0)),
    currency: this.fb.nonNullable.control(''),
    link: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    purchaseId: this.fb.control<number | null>(null),
    givenOn: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(contactId: number, contactName: string, gift?: GiftIdea): void {
    this.contactId = contactId;
    this.contactName.set(contactName);
    this.gift.set(gift ?? null);
    this.form.reset({
      title: gift?.title ?? '',
      status: gift?.status ?? 'Idea',
      significantDateId: gift?.significantDateId ?? null,
      occasion: gift?.occasion ?? '',
      estimatedAmount: gift?.estimatedAmount ?? null,
      currency: gift?.currency ?? '',
      link: gift?.link ?? '',
      purchaseId: gift?.purchaseId ?? null,
      givenOn: gift?.givenOn ?? null,
      notes: gift?.notes ?? '',
    });
    // Side lists: if one can't load, its choices are simply missing.
    this.familyLog.occasions().subscribe({
      next: (all) =>
        this.occasions.set(
          all.filter((o) => o.contactId === contactId || o.otherContactId === contactId),
        ),
      error: () => this.occasions.set([]),
    });
    this.purchasesService.purchases().subscribe({
      next: (list) => this.purchases.set(list),
      error: () => this.purchases.set([]),
    });
  }

  protected setStatus(status: GiftStatus): void {
    this.form.controls.status.setValue(status);
    if (status === 'Given' && !this.form.controls.givenOn.value) {
      this.form.controls.givenOn.setValue(todayIso());
    }
  }

  protected fieldError(name: 'title' | 'occasion' | 'link' | 'notes'): string | null {
    const control = this.form.controls[name];
    const shown = control.touched || this.attempted();
    if (name === 'link') {
      const link = control.value.trim();
      return shown && link && !isWebAddress(link)
        ? 'A link starts with http:// or https://.'
        : null;
    }
    if (!shown || !control.errors) {
      return null;
    }
    return control.errors['required'] ? 'Say what the gift is.' : 'That is too long.';
  }

  protected moneyError(): string | null {
    const amount = this.form.controls.estimatedAmount.value;
    const currency = this.form.controls.currency.value.trim();
    if (!this.attempted() && !this.form.controls.estimatedAmount.touched) {
      return null;
    }
    if (amount !== null && amount < 0) {
      return "The amount can't be below zero.";
    }
    return amount === null && currency ? 'Give the amount too, or leave the currency out.' : null;
  }

  protected currencyError(): string | null {
    const currency = this.form.controls.currency.value.trim().toUpperCase();
    const amount = this.form.controls.estimatedAmount.value;
    if (!this.attempted() && !this.form.controls.currency.touched) {
      return null;
    }
    if (amount !== null && !currency) {
      return 'Choose the currency.';
    }
    return currency && !/^[A-Z]{3}$/.test(currency) ? 'Three letters, like INR.' : null;
  }

  protected givenError(): string | null {
    if (this.form.controls.status.value !== 'Given') {
      return null;
    }
    const control = this.form.controls.givenOn;
    if (!control.touched && !this.attempted()) {
      return null;
    }
    if (control.errors) {
      return dateFieldError(control.errors);
    }
    if (!control.value) {
      return 'Say the day it was given.';
    }
    return control.value > todayIso() ? "That day hasn't come yet." : null;
  }

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (
      this.form.invalid ||
      this.fieldError('title') ||
      this.fieldError('link') ||
      this.moneyError() ||
      this.currencyError() ||
      this.givenError()
    ) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.familyLog
      .saveGift(this.gift()?.id ?? null, {
        contactId: this.contactId,
        title: v.title.trim(),
        significantDateId: v.significantDateId,
        occasion: v.significantDateId === null ? v.occasion.trim() || null : null,
        status: v.status,
        estimatedAmount: v.estimatedAmount,
        currency: v.currency.trim().toUpperCase() || null,
        link: v.link.trim() || null,
        purchaseId: v.status === 'Idea' ? null : v.purchaseId,
        givenOn: v.status === 'Given' ? v.givenOn : null,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: (gift) => this.activeModal.close({ kind: 'saved', gift }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the gift.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const gift = this.gift();
    if (!gift) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${gift.title}"?`,
      text: gift.purchaseId ? 'The purchase it points at (and its expense) stays.' : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.familyLog.removeGift(gift.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the gift.')),
    });
  }
}
