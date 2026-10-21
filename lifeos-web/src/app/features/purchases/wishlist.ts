import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  PurchasesService,
  WISH_PRIORITIES,
  WishPriority,
  WishlistItem,
} from '../../core/services/purchases.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openPurchaseEditor } from './purchase-editor';
import { WISH_PRIORITY_LABELS } from './purchases-view';

/** Opens a wish (new when missing). Resolves true when saved or deleted. */
async function openWishEditor(modal: NgbModal, wish?: WishlistItem): Promise<boolean> {
  const modalRef = modal.open(WishEditor, { ariaLabelledBy: 'wish-editor-heading' });
  (modalRef.componentInstance as WishEditor).configure(wish);
  try {
    return (await modalRef.result) as boolean;
  } catch {
    return false;
  }
}

/** A wish: what, where, what it costs now, what you'd pay, how much you want it. */
@Component({
  selector: 'app-wish-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="wish-editor-heading" class="modal-title h5">
          {{ wish() ? 'Wish' : 'Add to your wishlist' }}
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
          <label class="form-label" for="wish-name">What</label>
          <input
            id="wish-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Kindle Paperwhite"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-5">
            <label class="form-label" for="wish-store">
              Where <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="wish-store"
              type="text"
              class="form-control"
              formControlName="store"
              placeholder="e.g. Amazon"
            />
          </div>
          <div class="col-sm-7">
            <label class="form-label" for="wish-url">
              Link <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="wish-url"
              type="url"
              class="form-control"
              [class.is-invalid]="fieldError('url')"
              formControlName="url"
              placeholder="https://…"
            />
            @if (fieldError('url'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-6 col-sm-4">
            <label class="form-label" for="wish-price">Price now</label>
            <input
              id="wish-price"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('price')"
              formControlName="price"
              placeholder="e.g. 13999"
            />
            @if (fieldError('price'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label" for="wish-target">I'd pay</label>
            <input
              id="wish-target"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              [class.is-invalid]="fieldError('targetPrice')"
              formControlName="targetPrice"
              placeholder="Your target price"
            />
            @if (fieldError('targetPrice'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="wish-currency">Currency</label>
            <ng-select labelForId="wish-currency" formControlName="currency" [clearable]="false">
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div>
          <label class="form-label" for="wish-priority">How much you want it</label>
          <select id="wish-priority" class="form-select" formControlName="priority">
            @for (p of priorities; track p) {
              <option [ngValue]="p" [selected]="p === form.controls.priority.value">
                {{ priorityLabels[p] }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="form-label" for="wish-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="wish-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Colour, size, why you want it"
          ></textarea>
        </div>
        @if (wish(); as w) {
          <div class="border-top pt-3">
            <app-linked-items entityType="WishlistItem" [entityId]="w.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="WishlistItem"
              [entityId]="w.id"
              [entityTitle]="w.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (wish()) {
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
export class WishEditor {
  private readonly fb = inject(FormBuilder);
  private readonly purchasesService = inject(PurchasesService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly priorities = WISH_PRIORITIES;
  protected readonly priorityLabels = WISH_PRIORITY_LABELS;
  protected readonly wish = signal<WishlistItem | null>(null);
  protected readonly saving = signal(false);
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    store: this.fb.nonNullable.control('', Validators.maxLength(200)),
    url: this.fb.nonNullable.control('', [
      Validators.maxLength(500),
      Validators.pattern(/^\s*https?:\/\/\S+$/i),
    ]),
    price: this.fb.control<number | null>(null, Validators.min(0)),
    targetPrice: this.fb.control<number | null>(null, Validators.min(0)),
    currency: this.fb.nonNullable.control(''),
    priority: this.fb.nonNullable.control<WishPriority>('Medium'),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(wish?: WishlistItem): void {
    this.wish.set(wish ?? null);
    this.form.reset({
      name: wish?.name ?? '',
      store: wish?.store ?? '',
      url: wish?.url ?? '',
      price: wish?.price ?? null,
      targetPrice: wish?.targetPrice ?? null,
      currency: wish?.currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR',
      priority: wish?.priority ?? 'Medium',
      notes: wish?.notes ?? '',
    });
  }

  protected fieldError(name: 'name' | 'url' | 'price' | 'targetPrice'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required'] ? 'Say what you’d like.' : 'That is too long.';
      case 'url':
        return 'A web address starting with http:// or https://.';
      default:
        return 'Can’t be negative.';
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const priced = v.price !== null || v.targetPrice !== null;
    this.saving.set(true);
    this.purchasesService
      .saveWish(this.wish()?.id ?? null, {
        name: v.name,
        store: v.store.trim() || null,
        url: v.url.trim() || null,
        price: v.price,
        targetPrice: v.targetPrice,
        currency: priced ? v.currency : null,
        priority: v.priority,
        notes: v.notes.trim() || null,
      })
      .subscribe({
        next: () => this.activeModal.close(true),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the wish.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const wish = this.wish();
    if (!wish) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${wish.name}"?`,
      text: wish.purchaseId ? 'The purchase stays.' : 'It leaves your wishlist.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removeWish(wish.id).subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the wish.')),
    });
  }
}

/** The wishlist: most wanted first — anything at your target price on top — and what you've since bought. */
@Component({
  selector: 'app-wishlist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError, RouterLink],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Wishlist</h1>
          <p class="text-body-secondary mb-0 small">
            Things you'd like, and the price you'd pay for them.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Add a wish
        </button>
      </div>

      @if (loadFailed() && !wishes()) {
        <app-load-error message="Couldn't load your wishlist." (retry)="load()" />
      } @else if (wishes(); as wishes) {
        @if (wishes.length === 0) {
          <p class="text-body-secondary">
            Nothing on your wishlist. Add something with the price you'd pay — it moves to the top
            when it gets there.
          </p>
        } @else {
          <div class="card mb-4">
            <ul class="list-group list-group-flush">
              @for (w of wanted(); track w.id) {
                <li class="list-group-item py-3" [id]="'wish-' + w.id">
                  <div class="d-flex flex-wrap gap-2 align-items-start">
                    <div class="min-w-0 flex-grow-1">
                      <button
                        type="button"
                        class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                        (click)="edit(w)"
                      >
                        {{ w.name }}
                      </button>
                      @if (w.atTarget) {
                        <span class="badge text-bg-success ms-1">At your price</span>
                      }
                      <div class="small text-body-secondary">
                        {{ priorityLabels[w.priority] }}
                        @if (w.store) {
                          · {{ w.store }}
                        }
                        @if (w.url) {
                          ·
                          <a [href]="w.url" target="_blank" rel="noopener noreferrer">Open link</a>
                        }
                      </div>
                    </div>
                    <div class="text-end small">
                      @if (w.price !== null && w.currency) {
                        <div class="fw-semibold">{{ money(w.price, w.currency) }}</div>
                      }
                      @if (w.targetPrice !== null && w.currency) {
                        <div class="text-body-secondary">
                          you'd pay {{ money(w.targetPrice, w.currency) }}
                        </div>
                      }
                      <button
                        type="button"
                        class="btn btn-outline-primary btn-sm mt-1"
                        (click)="bought(w)"
                      >
                        Bought it
                      </button>
                      @if (financeOn() && (w.price ?? w.targetPrice) !== null) {
                        <a
                          class="btn btn-link btn-sm mt-1 d-block p-0"
                          routerLink="/finance/scenarios"
                          [queryParams]="{
                            name: w.name,
                            amount: w.price ?? w.targetPrice,
                            currency: w.currency,
                          }"
                        >
                          Can I afford it?
                        </a>
                      }
                    </div>
                  </div>
                </li>
              } @empty {
                <li class="list-group-item text-body-secondary small">
                  Everything on your wishlist has been bought.
                </li>
              }
            </ul>
          </div>
          @if (boughtWishes().length) {
            <h2 class="h6">Bought</h2>
            <ul class="list-unstyled small">
              @for (w of boughtWishes(); track w.id) {
                <li class="mb-1">
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0 link-secondary text-start"
                    (click)="edit(w)"
                  >
                    {{ w.name }}
                  </button>
                  <span class="text-body-secondary"> — {{ w.purchasedOn | date }}</span>
                </li>
              }
            </ul>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Wishlist {
  private readonly purchasesService = inject(PurchasesService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsService = inject(SettingsService);

  /** "Can I afford it?" lives in Finance — offered only while Finance is switched on. */
  protected readonly financeOn = computed(
    () => !this.settingsService.hiddenModules().has('Finance'),
  );

  /** `?open=<id>` (from search or a reminder) opens that wish. */
  readonly open = input<string>();

  protected readonly money = formatMoney;
  protected readonly priorityLabels = WISH_PRIORITY_LABELS;
  protected readonly wishes = signal<WishlistItem[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly wanted = computed(() => this.wishes()?.filter((w) => !w.purchaseId) ?? []);
  protected readonly boughtWishes = computed(
    () => this.wishes()?.filter((w) => w.purchaseId) ?? [],
  );
  private opened = false;

  constructor() {
    this.load();
    // Opening another one while already here (search, a reminder) arrives as a new `?open=`.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.opened = false;
          this.openRequested();
        });
      }
    });
  }

  protected load(): void {
    this.purchasesService
      .wishlist()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wishes) => {
          this.wishes.set(wishes);
          this.loadFailed.set(false);
          this.openRequested();
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(wish?: WishlistItem): Promise<void> {
    if (await openWishEditor(this.modal, wish)) {
      this.load();
      this.toast.success('Wishlist saved.');
    }
  }

  /** Opens the wish named in `?open=` once it's loaded. */
  private openRequested(): void {
    const id = Number(this.open());
    const wish = this.wishes()?.find((w) => w.id === id);
    if (this.opened || !wish) {
      return;
    }
    this.opened = true;
    void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
    void this.edit(wish);
  }

  /** Records the purchase that fulfils the wish; it then leaves the list. */
  protected async bought(wish: WishlistItem): Promise<void> {
    const result = await openPurchaseEditor(this.modal, undefined, {
      title: wish.name,
      store: wish.store,
      estimatedAmount: wish.price,
      amount: wish.price,
      currency: wish.currency,
      wishlistItemId: wish.id,
      from: 'From your wishlist',
    });
    if (result) {
      this.load();
      this.toast.success(`${wish.name} — bought. Enjoy it.`);
    }
  }
}
