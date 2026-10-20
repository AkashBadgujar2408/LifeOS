import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { browserTimeZone } from '../dates/today';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';

// Same values as the CHECKs in 15_shopping.sql (never rename one).
export const WISH_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type WishPriority = (typeof WISH_PRIORITIES)[number];

export interface MoneyAmount {
  currency: string;
  amount: number;
}

/** Something bought; it can carry its Finance expense and the Home item it became. */
export interface Purchase {
  id: number;
  title: string;
  store: string | null;
  purchasedOn: string;
  /** What was actually paid in money (after any voucher or coupon). */
  amount: number;
  estimatedAmount: number | null;
  currency: string;
  transactionId: number | null;
  paidFromAccountName: string | null;
  assetId: number | null;
  assetName: string | null;
  notes: string | null;
  tags: Tag[];
  listItemCount: number;
  wishlistItemName: string | null;
}

export interface PurchaseExpense {
  accountId: number;
  exchangeRate: number | null;
}

export interface PurchaseAsset {
  name: string | null;
  propertyId: number | null;
  room: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantity: number;
}

export interface PurchaseWarranty {
  kind: 'Warranty' | 'Extended' | 'AMC';
  provider: string | null;
  expiresOn: string;
  reminderDays: number | null;
}

export interface PurchasePayload {
  title: string;
  store: string | null;
  purchasedOn: string;
  amount: number;
  estimatedAmount: number | null;
  currency: string;
  notes: string | null;
  tagIds: number[];
  /** Create only — what this one purchase does in one step. */
  expense: PurchaseExpense | null;
  asset: PurchaseAsset | null;
  warranty: PurchaseWarranty | null;
  shoppingListItemIds: number[];
  wishlistItemId: number | null;
  today: string;
  timeZone: string;
}

export interface ShoppingListItem {
  id: number;
  listId: number;
  name: string;
  quantity: string | null;
  estimatedPrice: number | null;
  currency: string | null;
  sortOrder: number;
  done: boolean;
  purchaseId: number | null;
  purchaseTitle: string | null;
}

export interface ShoppingList {
  id: number;
  name: string;
  isArchived: boolean;
  notes: string | null;
  itemCount: number;
  doneCount: number;
  /** What's still to buy, per currency. */
  estimatedLeft: MoneyAmount[];
  /** Only on a single list's read. */
  items: ShoppingListItem[];
}

export interface ShoppingListPayload {
  name: string;
  isArchived: boolean;
  notes: string | null;
}

export interface ShoppingListItemPayload {
  name: string;
  quantity: string | null;
  estimatedPrice: number | null;
  currency: string | null;
}

export interface WishlistItem {
  id: number;
  name: string;
  store: string | null;
  url: string | null;
  price: number | null;
  targetPrice: number | null;
  currency: string | null;
  priority: WishPriority;
  notes: string | null;
  purchaseId: number | null;
  purchasedOn: string | null;
  /** The price has come down to the target. */
  atTarget: boolean;
}

export interface WishlistItemPayload {
  name: string;
  store: string | null;
  url: string | null;
  price: number | null;
  targetPrice: number | null;
  currency: string | null;
  priority: WishPriority;
  notes: string | null;
}

/** Purchases, shopping lists and the wishlist (`api/Purchases/*`). */
@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Purchases';

  // ---- Purchases ----

  purchases(from?: string, to?: string): Observable<Purchase[]> {
    let params = new HttpParams();
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.http
      .get<ApiResponse<Purchase[]>>(`${this.base}/Purchases`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  purchase(id: number): Observable<Purchase> {
    return this.http
      .get<ApiResponse<Purchase>>(`${this.base}/Purchases/${id}`)
      .pipe(map((response) => response.data!));
  }

  stores(): Observable<string[]> {
    return this.http
      .get<ApiResponse<string[]>>(`${this.base}/Purchases/stores`)
      .pipe(map((response) => response.data ?? []));
  }

  /** A new purchase can record its expense, add the item to the inventory and its warranty (which has a reminder). */
  savePurchase(
    id: number | null,
    payload: Omit<PurchasePayload, 'timeZone'>,
  ): Observable<Purchase> {
    const body: PurchasePayload = { ...payload, timeZone: browserTimeZone() };
    const request = id
      ? this.http.put<ApiResponse<Purchase>>(`${this.base}/Purchases/${id}`, body)
      : this.http.post<ApiResponse<Purchase>>(`${this.base}/Purchases`, body);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  recordPurchaseExpense(id: number, payload: PurchaseExpense): Observable<Purchase> {
    return this.http
      .put<ApiResponse<Purchase>>(`${this.base}/Purchases/${id}/expense`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Takes the expense it created back out of Finance. */
  removePurchaseExpense(id: number): Observable<Purchase> {
    return this.http
      .delete<ApiResponse<Purchase>>(`${this.base}/Purchases/${id}/expense`)
      .pipe(map((response) => response.data!));
  }

  /** Deletes the purchase and its expense; the inventory item stays. */
  removePurchase(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Purchases/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Shopping lists ----

  lists(includeArchived = false): Observable<ShoppingList[]> {
    return this.http
      .get<ApiResponse<ShoppingList[]>>(`${this.base}/ShoppingLists`, {
        params: { includeArchived },
      })
      .pipe(map((response) => response.data ?? []));
  }

  list(id: number): Observable<ShoppingList> {
    return this.http
      .get<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveList(id: number | null, payload: ShoppingListPayload): Observable<ShoppingList> {
    const request = id
      ? this.http.put<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${id}`, payload)
      : this.http.post<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeList(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/ShoppingLists/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  addItem(listId: number, payload: ShoppingListItemPayload): Observable<ShoppingList> {
    return this.http
      .post<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${listId}/items`, payload)
      .pipe(map((response) => response.data!));
  }

  updateItem(
    listId: number,
    itemId: number,
    payload: ShoppingListItemPayload,
  ): Observable<ShoppingList> {
    return this.http
      .put<ApiResponse<ShoppingList>>(
        `${this.base}/ShoppingLists/${listId}/items/${itemId}`,
        payload,
      )
      .pipe(map((response) => response.data!));
  }

  setItemDone(listId: number, itemId: number, done: boolean): Observable<ShoppingList> {
    return this.http
      .put<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${listId}/items/${itemId}/done`, {
        done,
      })
      .pipe(map((response) => response.data!));
  }

  removeItem(listId: number, itemId: number): Observable<ShoppingList> {
    return this.http
      .delete<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${listId}/items/${itemId}`)
      .pipe(map((response) => response.data!));
  }

  clearDone(listId: number): Observable<ShoppingList> {
    return this.http
      .delete<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${listId}/items/done`)
      .pipe(map((response) => response.data!));
  }

  reorderItems(listId: number, itemIds: number[]): Observable<ShoppingList> {
    return this.http
      .put<ApiResponse<ShoppingList>>(`${this.base}/ShoppingLists/${listId}/items/order`, itemIds)
      .pipe(map((response) => response.data!));
  }

  // ---- Wishlist ----

  wishlist(): Observable<WishlistItem[]> {
    return this.http
      .get<ApiResponse<WishlistItem[]>>(`${this.base}/Wishlist`)
      .pipe(map((response) => response.data ?? []));
  }

  wish(id: number): Observable<WishlistItem> {
    return this.http
      .get<ApiResponse<WishlistItem>>(`${this.base}/Wishlist/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveWish(id: number | null, payload: WishlistItemPayload): Observable<WishlistItem> {
    const request = id
      ? this.http.put<ApiResponse<WishlistItem>>(`${this.base}/Wishlist/${id}`, payload)
      : this.http.post<ApiResponse<WishlistItem>>(`${this.base}/Wishlist`, payload);
    return request.pipe(map((response) => response.data!));
  }

  removeWish(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Wishlist/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }
}
