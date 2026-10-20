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
  /** Vouchers, coupons or points used on it (create only). */
  redemptions: PurchaseRedemption[];
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

// ---- Rewards & vouchers (Session 70a) ----

export const BENEFIT_KINDS = [
  'Voucher',
  'GiftCard',
  'StoreCredit',
  'Coupon',
  'Cashback',
  'Points',
  'WalletCredit',
] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];
export type BenefitStatus = 'Usable' | 'UsedUp' | 'Expired' | 'Pending' | 'Received';

export interface Benefit {
  id: number;
  kind: BenefitKind;
  name: string;
  /** Where it can be used — or, for points, the programme. */
  store: string | null;
  value: number | null;
  currency: string | null;
  discountPercent: number | null;
  minSpend: number | null;
  valuePerPoint: number | null;
  hasCode: boolean;
  hasPin: boolean;
  /** Only on a single benefit's read. */
  code: string | null;
  pin: string | null;
  expiresOn: string | null;
  reminderDays: number | null;
  purchaseId: number | null;
  purchaseTitle: string | null;
  accountId: number | null;
  accountName: string | null;
  expectedBy: string | null;
  receivedOn: string | null;
  transactionId: number | null;
  notes: string | null;
  // Computed on the server for the day asked:
  status: BenefitStatus;
  balance: number | null;
  pointsAvailable: number | null;
  pointsValue: number | null;
  lost: number;
  lostOn: string | null;
  expiringSoon: boolean;
  overdue: boolean;
  nextExpiry: string | null;
}

export interface BenefitRedemption {
  id: number;
  redeemedOn: string;
  amount: number | null;
  points: number | null;
  purchaseId: number | null;
  purchaseTitle: string | null;
  transactionId: number | null;
  notes: string | null;
}

export interface PointBatch {
  id: number;
  earnedOn: string;
  points: number;
  expiresOn: string | null;
  purchaseId: number | null;
  purchaseTitle: string | null;
  notes: string | null;
  remaining: number;
}

export interface BenefitDetail {
  benefit: Benefit;
  redemptions: BenefitRedemption[];
  batches: PointBatch[];
}

export interface BenefitMoney {
  accountId: number;
  exchangeRate: number | null;
}

export interface BenefitPayload {
  kind: BenefitKind;
  name: string;
  store: string | null;
  value: number | null;
  currency: string | null;
  discountPercent: number | null;
  minSpend: number | null;
  valuePerPoint: number | null;
  code: string | null;
  pin: string | null;
  expiresOn: string | null;
  reminderDays: number | null;
  purchaseId: number | null;
  accountId: number | null;
  expectedBy: string | null;
  notes: string | null;
  /** Create only: you paid for it (one purchase with its expense). */
  bought: BenefitMoney | null;
  today: string;
}

export interface RewardsSummary {
  usable: MoneyAmount[];
  lostThisYear: MoneyAmount[];
  cashbackThisYear: MoneyAmount[];
  cashbackPending: MoneyAmount[];
}

/** A voucher, coupon or points used while recording a purchase. */
export interface PurchaseRedemption {
  benefitId: number;
  amount: number | null;
  points: number | null;
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

  // ---- Rewards & vouchers ----

  benefits(today: string): Observable<Benefit[]> {
    return this.http
      .get<ApiResponse<Benefit[]>>(`${this.base}/Benefits`, { params: { today } })
      .pipe(map((response) => response.data ?? []));
  }

  /** With its code and PIN, uses and points batches. */
  benefit(id: number, today: string): Observable<BenefitDetail> {
    return this.http
      .get<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}`, { params: { today } })
      .pipe(map((response) => response.data!));
  }

  rewardsSummary(today: string): Observable<RewardsSummary> {
    return this.http
      .get<ApiResponse<RewardsSummary>>(`${this.base}/Benefits/summary`, { params: { today } })
      .pipe(map((response) => response.data!));
  }

  /** What can be used at a store today (offered while recording a purchase). */
  usableAt(store: string, today: string): Observable<Benefit[]> {
    return this.http
      .get<ApiResponse<Benefit[]>>(`${this.base}/Benefits/usable`, { params: { store, today } })
      .pipe(map((response) => response.data ?? []));
  }

  /** Expiring within 30 days or cashback overdue (My Day). */
  rewardsAttention(today: string): Observable<Benefit[]> {
    return this.http
      .get<ApiResponse<Benefit[]>>(`${this.base}/Benefits/attention`, { params: { today } })
      .pipe(map((response) => response.data ?? []));
  }

  /** Saving moves (or removes) the expiry reminder. */
  saveBenefit(id: number | null, payload: BenefitPayload): Observable<BenefitDetail> {
    const body = { ...payload, timeZone: browserTimeZone() };
    const request = id
      ? this.http.put<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}`, body)
      : this.http.post<ApiResponse<BenefitDetail>>(`${this.base}/Benefits`, body);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  removeBenefit(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Benefits/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  /** Used some: money, a coupon (once) or points — points may be cashed in to an account. */
  redeem(
    id: number,
    payload: {
      redeemedOn: string;
      amount: number | null;
      points: number | null;
      notes: string | null;
      cashIn: BenefitMoney | null;
      today: string;
    },
  ): Observable<BenefitDetail> {
    return this.http
      .post<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}/redemptions`, {
        ...payload,
        timeZone: browserTimeZone(),
      })
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  removeRedemption(id: number, redemptionId: number, today: string): Observable<BenefitDetail> {
    return this.http
      .delete<ApiResponse<BenefitDetail>>(
        `${this.base}/Benefits/${id}/redemptions/${redemptionId}`,
        {
          params: { today },
        },
      )
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  addPoints(
    id: number,
    payload: {
      earnedOn: string;
      points: number;
      expiresOn: string | null;
      notes: string | null;
      today: string;
    },
  ): Observable<BenefitDetail> {
    return this.http
      .post<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}/points`, {
        ...payload,
        timeZone: browserTimeZone(),
      })
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  removePoints(id: number, batchId: number, today: string): Observable<BenefitDetail> {
    return this.http
      .delete<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}/points/${batchId}`, {
        params: { today },
      })
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  /** Cashback arrived: with an account, one Finance income. */
  markReceived(
    id: number,
    payload: {
      receivedOn: string;
      accountId: number | null;
      exchangeRate: number | null;
      today: string;
    },
  ): Observable<BenefitDetail> {
    return this.http
      .put<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}/received`, payload)
      .pipe(map((response) => response.data!));
  }

  undoReceived(id: number, today: string): Observable<BenefitDetail> {
    return this.http
      .delete<ApiResponse<BenefitDetail>>(`${this.base}/Benefits/${id}/received`, {
        params: { today },
      })
      .pipe(map((response) => response.data!));
  }
}
