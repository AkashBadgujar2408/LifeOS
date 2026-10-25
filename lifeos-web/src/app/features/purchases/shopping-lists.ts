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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import Swal from 'sweetalert2';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  PurchasesService,
  ShoppingList,
  ShoppingListItem,
} from '../../core/services/purchases.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openPurchaseEditor } from './purchase-editor';
import { leftText } from './purchases-view';

/**
 * Shopping lists: pick a list, add what to buy, tick it into the basket, then record the ticked items as one
 * purchase (which can go to Finance and the inventory). `/purchases/lists/:id` opens a list directly.
 */
@Component({
  selector: 'app-shopping-lists',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, LoadError, LinkedItems, EntityReminders],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Shopping lists</h1>
          <p class="text-body-secondary mb-0 small">
            Tick things into the basket, then record what you bought in one go.
          </p>
        </div>
        <a routerLink="/purchases" class="btn btn-outline-primary">
          <i class="bi bi-bag"></i> Purchases
        </a>
      </div>

      @if (loadFailed() && !lists()) {
        <app-load-error message="Couldn't load your shopping lists." (retry)="load()" />
      } @else if (lists(); as lists) {
        <div class="row g-4">
          <div class="col-lg-4">
            <form
              class="d-flex gap-2 mb-3"
              [formGroup]="newListForm"
              (ngSubmit)="createList()"
              novalidate
            >
              <label class="visually-hidden" for="new-list-name">New list</label>
              <input
                id="new-list-name"
                type="text"
                class="form-control"
                [class.is-invalid]="newListError()"
                formControlName="name"
                placeholder="New list, e.g. Groceries"
                autocomplete="off"
              />
              <button type="submit" class="btn btn-primary" aria-label="Add the list">
                <i class="bi bi-plus-lg"></i>
              </button>
            </form>
            @if (newListError(); as error) {
              <div class="invalid-feedback d-block mb-2">{{ error }}</div>
            }
            @if (lists.length === 0) {
              <p class="text-body-secondary small">No lists yet. Name one above to start.</p>
            } @else {
              <div class="list-group">
                @for (l of lists; track l.id) {
                  <a
                    class="list-group-item list-group-item-action d-flex justify-content-between gap-2"
                    [class.active]="l.id === selectedId()"
                    [attr.aria-current]="l.id === selectedId() ? 'page' : null"
                    [routerLink]="['/purchases/lists', l.id]"
                  >
                    <span class="min-w-0 text-truncate">
                      {{ l.name }}
                      @if (l.isArchived) {
                        <span class="small">(archived)</span>
                      }
                    </span>
                    <span class="small text-nowrap">{{ l.doneCount }}/{{ l.itemCount }}</span>
                  </a>
                }
              </div>
            }
            <div class="form-check mt-3">
              <input
                id="show-archived"
                type="checkbox"
                class="form-check-input"
                [checked]="showArchived()"
                (change)="toggleArchived()"
              />
              <label class="form-check-label small" for="show-archived">Show archived lists</label>
            </div>
          </div>

          <div class="col-lg-8">
            @if (list(); as l) {
              <section class="card" aria-labelledby="list-heading">
                <div class="card-body">
                  <div class="d-flex flex-wrap align-items-start gap-2 mb-3">
                    <div class="min-w-0 flex-grow-1">
                      <h2 id="list-heading" class="h5 mb-0 text-break">{{ l.name }}</h2>
                      <div class="small text-body-secondary">
                        {{ l.itemCount - l.doneCount }} to buy · {{ l.doneCount }} ticked
                        @if (left(); as text) {
                          · {{ text }}
                        }
                      </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                      @if (basket().length) {
                        <button type="button" class="btn btn-primary btn-sm" (click)="buyTicked()">
                          <i class="bi bi-bag-check"></i> Record {{ basket().length }} bought
                        </button>
                      }
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        (click)="renameList()"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        (click)="archiveList(!l.isArchived)"
                      >
                        {{ l.isArchived ? 'Unarchive' : 'Archive' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-danger btn-sm"
                        (click)="deleteList()"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <form
                    class="row g-2 mb-3"
                    [formGroup]="itemForm"
                    (ngSubmit)="saveItem()"
                    novalidate
                  >
                    <div class="col-sm-5">
                      <label class="visually-hidden" for="item-name">What</label>
                      <input
                        id="item-name"
                        type="text"
                        class="form-control"
                        [class.is-invalid]="itemError('name')"
                        formControlName="name"
                        [placeholder]="editingId() ? 'What' : 'Add something, e.g. Milk'"
                        autocomplete="off"
                      />
                      @if (itemError('name'); as error) {
                        <div class="invalid-feedback d-block">{{ error }}</div>
                      }
                    </div>
                    <div class="col-4 col-sm-2">
                      <label class="visually-hidden" for="item-quantity">How much</label>
                      <input
                        id="item-quantity"
                        type="text"
                        class="form-control"
                        formControlName="quantity"
                        placeholder="e.g. 2 L"
                        autocomplete="off"
                      />
                    </div>
                    <div class="col-4 col-sm-2">
                      <label class="visually-hidden" for="item-price">Expected price</label>
                      <input
                        id="item-price"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control"
                        [class.is-invalid]="itemError('estimatedPrice')"
                        formControlName="estimatedPrice"
                        [placeholder]="'Price, ' + baseCurrency()"
                      />
                      @if (itemError('estimatedPrice'); as error) {
                        <div class="invalid-feedback d-block">{{ error }}</div>
                      }
                    </div>
                    <div class="col-4 col-sm-3 d-flex gap-1">
                      <button type="submit" class="btn btn-outline-primary flex-grow-1">
                        {{ editingId() ? 'Save' : 'Add' }}
                      </button>
                      @if (editingId()) {
                        <button
                          type="button"
                          class="btn btn-outline-secondary"
                          aria-label="Stop editing"
                          (click)="cancelEdit()"
                        >
                          <i class="bi bi-x-lg"></i>
                        </button>
                      }
                    </div>
                  </form>

                  @if (l.items.length === 0) {
                    <p class="text-body-secondary small mb-0">Nothing on this list yet.</p>
                  } @else {
                    <ul class="list-group list-group-flush">
                      @for (item of l.items; track item.id; let i = $index) {
                        <li class="list-group-item px-0 d-flex gap-2 align-items-center">
                          <input
                            type="checkbox"
                            class="form-check-input mt-0 flex-shrink-0"
                            [id]="'item-' + item.id"
                            [checked]="item.done"
                            [disabled]="item.purchaseId !== null"
                            (change)="tick(item, $any($event.target).checked)"
                          />
                          <label
                            class="min-w-0 flex-grow-1 mb-0"
                            [for]="'item-' + item.id"
                            [class.text-decoration-line-through]="item.done"
                            [class.text-body-secondary]="item.done"
                          >
                            <span class="text-break">{{ item.name }}</span>
                            @if (item.quantity) {
                              <span class="small text-body-secondary"> · {{ item.quantity }}</span>
                            }
                            @if (item.purchaseTitle) {
                              <span class="small d-block">bought — {{ item.purchaseTitle }}</span>
                            }
                          </label>
                          @if (item.estimatedPrice !== null && item.currency) {
                            <span class="small text-nowrap">{{
                              money(item.estimatedPrice, item.currency)
                            }}</span>
                          }
                          @if (!item.done) {
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 link-secondary"
                              [attr.aria-label]="'Move ' + item.name + ' up'"
                              [disabled]="i === 0"
                              (click)="move(i, -1)"
                            >
                              <i class="bi bi-arrow-up"></i>
                            </button>
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 link-secondary"
                              [attr.aria-label]="'Move ' + item.name + ' down'"
                              [disabled]="i === toBuyCount() - 1"
                              (click)="move(i, 1)"
                            >
                              <i class="bi bi-arrow-down"></i>
                            </button>
                          }
                          @if (!item.purchaseId) {
                            <button
                              type="button"
                              class="btn btn-link btn-sm p-0 link-secondary"
                              [attr.aria-label]="'Edit ' + item.name"
                              (click)="startEdit(item)"
                            >
                              <i class="bi bi-pencil"></i>
                            </button>
                          }
                          <button
                            type="button"
                            class="btn btn-link btn-sm p-0 link-danger"
                            [attr.aria-label]="'Remove ' + item.name"
                            (click)="removeItem(item)"
                          >
                            <i class="bi bi-x-lg"></i>
                          </button>
                        </li>
                      }
                    </ul>
                    @if (l.doneCount) {
                      <button
                        type="button"
                        class="btn btn-link btn-sm p-0 mt-2 link-secondary"
                        (click)="clearDone()"
                      >
                        Clear ticked items
                      </button>
                    }
                  }
                </div>
              </section>
              <div class="row g-4 mt-1">
                <div class="col-md-6">
                  <app-linked-items entityType="ShoppingList" [entityId]="l.id" />
                </div>
                <div class="col-md-6">
                  <app-entity-reminders
                    entityType="ShoppingList"
                    [entityId]="l.id"
                    [entityTitle]="l.name"
                  />
                </div>
              </div>
            } @else if (lists.length) {
              <p class="text-body-secondary">Choose a list.</p>
            }
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class ShoppingLists {
  private readonly purchasesService = inject(PurchasesService);
  private readonly settingsService = inject(SettingsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter (`/purchases/lists/:id`), absent on `/purchases/lists`. */
  readonly id = input<string>();

  protected readonly money = formatMoney;
  protected readonly lists = signal<ShoppingList[] | null>(null);
  protected readonly list = signal<ShoppingList | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showArchived = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly baseCurrency = computed(
    () => this.settingsService.settings()?.baseCurrency ?? 'INR',
  );
  protected readonly selectedId = computed(() => Number(this.id()) || null);
  protected readonly left = computed(() => leftText(this.list()?.estimatedLeft ?? []));
  protected readonly toBuyCount = computed(
    () => this.list()?.items.filter((i) => !i.done).length ?? 0,
  );
  /** Ticked but not yet recorded as a purchase. */
  protected readonly basket = computed(
    () => this.list()?.items.filter((i) => i.done && i.purchaseId === null) ?? [],
  );

  protected readonly newListForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
  });
  protected readonly itemForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    quantity: this.fb.nonNullable.control('', Validators.maxLength(50)),
    estimatedPrice: this.fb.control<number | null>(null, Validators.min(0)),
  });

  constructor() {
    itemTitle(() => this.list()?.name);
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.purchasesService
      .lists(this.showArchived())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lists) => {
          this.lists.set(lists);
          this.loadFailed.set(false);
          const id = this.selectedId() ?? (lists.length === 1 ? lists[0].id : null);
          if (id) {
            this.loadList(id);
          } else {
            this.list.set(null);
          }
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected toggleArchived(): void {
    this.showArchived.set(!this.showArchived());
    this.load();
  }

  protected newListError(): string | null {
    const control = this.newListForm.controls.name;
    return control.touched && control.errors
      ? control.errors['required']
        ? 'Name the list.'
        : 'That is too long.'
      : null;
  }

  protected itemError(name: 'name' | 'estimatedPrice'): string | null {
    const control = this.itemForm.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    return name === 'name'
      ? control.errors['required']
        ? 'Say what to buy.'
        : 'That is too long.'
      : 'Can’t be negative.';
  }

  protected createList(): void {
    const name = this.newListForm.controls.name;
    name.setValue(name.value.trim());
    if (this.newListForm.invalid) {
      this.newListForm.markAllAsTouched();
      return;
    }
    this.purchasesService
      .saveList(null, { name: name.value, isArchived: false, notes: null })
      .subscribe({
        next: (list) => {
          this.newListForm.reset();
          void this.router.navigate(['/purchases/lists', list.id]);
          this.load();
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not add the list.')),
      });
  }

  protected saveItem(): void {
    const list = this.list();
    if (!list) {
      return;
    }
    const name = this.itemForm.controls.name;
    name.setValue(name.value.trim());
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }
    const v = this.itemForm.getRawValue();
    const payload = {
      name: v.name,
      quantity: v.quantity.trim() || null,
      estimatedPrice: v.estimatedPrice,
      currency: v.estimatedPrice === null ? null : this.baseCurrency(),
    };
    const editing = this.editingId();
    this.apply(
      editing
        ? this.purchasesService.updateItem(list.id, editing, payload)
        : this.purchasesService.addItem(list.id, payload),
      'Could not save the item.',
      () => {
        this.itemForm.reset();
        this.editingId.set(null);
      },
    );
  }

  protected startEdit(item: ShoppingListItem): void {
    this.editingId.set(item.id);
    this.itemForm.reset({
      name: item.name,
      quantity: item.quantity ?? '',
      estimatedPrice: item.estimatedPrice,
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.itemForm.reset();
  }

  protected tick(item: ShoppingListItem, done: boolean): void {
    const list = this.list();
    if (list) {
      this.apply(this.purchasesService.setItemDone(list.id, item.id, done), 'Could not tick it.');
    }
  }

  protected removeItem(item: ShoppingListItem): void {
    const list = this.list();
    if (list) {
      this.apply(this.purchasesService.removeItem(list.id, item.id), 'Could not remove it.');
    }
  }

  protected clearDone(): void {
    const list = this.list();
    if (list) {
      this.apply(this.purchasesService.clearDone(list.id), 'Could not clear the ticked items.');
    }
  }

  /** Moves an item to buy up or down among the items still to buy. */
  protected move(index: number, step: -1 | 1): void {
    const list = this.list();
    if (!list) {
      return;
    }
    const ids = list.items.map((i) => i.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    this.apply(this.purchasesService.reorderItems(list.id, ids), 'Could not move it.');
  }

  /** Records the ticked items as one purchase, the expected price prefilled when they're in one currency. */
  protected async buyTicked(): Promise<void> {
    const list = this.list();
    const basket = this.basket();
    if (!list || basket.length === 0) {
      return;
    }
    const priced = basket.filter((i) => i.estimatedPrice !== null && i.currency);
    const currencies = new Set(priced.map((i) => i.currency));
    const estimate =
      priced.length && currencies.size === 1
        ? Math.round(priced.reduce((sum, i) => sum + i.estimatedPrice!, 0) * 100) / 100
        : null;
    const result = await openPurchaseEditor(this.modal, undefined, {
      title: basket.length === 1 ? basket[0].name : list.name,
      estimatedAmount: estimate,
      currency: currencies.size === 1 ? [...currencies][0] : null,
      shoppingListItemIds: basket.map((i) => i.id),
      from: `${basket.length} ticked item${basket.length === 1 ? '' : 's'} from ${list.name}`,
    });
    if (result) {
      this.load();
      this.toast.success('Purchase recorded.');
    }
  }

  protected async renameList(): Promise<void> {
    const list = this.list();
    if (!list) {
      return;
    }
    const answer = await Swal.fire({
      title: 'Rename the list',
      input: 'text',
      inputValue: list.name,
      inputAttributes: { 'aria-label': 'List name', maxlength: '200' },
      showCancelButton: true,
      confirmButtonText: 'Rename',
      confirmButtonColor: 'var(--lifeos-teal-strong)',
      inputValidator: (value) => (value.trim() ? null : 'Name the list.'),
    });
    if (answer.isConfirmed) {
      this.saveListMeta(answer.value.trim(), list.isArchived);
    }
  }

  protected archiveList(archived: boolean): void {
    const list = this.list();
    if (list) {
      this.saveListMeta(list.name, archived);
    }
  }

  protected async deleteList(): Promise<void> {
    const list = this.list();
    if (!list) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${list.name}"?`,
      text: 'Its items go with it. Purchases made from it stay.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.purchasesService.removeList(list.id).subscribe({
      next: () => {
        this.toast.success('List deleted.');
        void this.router.navigate(['/purchases/lists']);
        this.list.set(null);
        this.load();
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the list.')),
    });
  }

  private saveListMeta(name: string, isArchived: boolean): void {
    const list = this.list();
    if (!list) {
      return;
    }
    this.purchasesService.saveList(list.id, { name, isArchived, notes: list.notes }).subscribe({
      next: () => this.load(),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not save the list.')),
    });
  }

  private loadList(id: number): void {
    this.purchasesService
      .list(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.list.set(list),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the list.')),
      });
  }

  /** Runs a change that returns the whole list, shows it, and refreshes the counts on the left. */
  private apply(request: Observable<ShoppingList>, failure: string, done?: () => void): void {
    request.subscribe({
      next: (list) => {
        this.list.set(list);
        done?.();
        this.lists.update(
          (lists) =>
            lists?.map((l) =>
              l.id === list.id ? { ...l, itemCount: list.itemCount, doneCount: list.doneCount } : l,
            ) ?? null,
        );
      },
      error: (err) => this.toast.error(apiErrorMessage(err, failure)),
    });
  }
}
