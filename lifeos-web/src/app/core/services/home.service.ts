import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { browserTimeZone } from '../dates/today';
import { ApiResponse } from './api-response';
import { RemindersService } from './reminders.service';
import { Tag } from './tags.service';
import { RecurrenceFrequency } from './tasks.service';

// Same values as the CHECKs in 14_home.sql (never rename one).
export const PROPERTY_KINDS = ['House', 'Apartment', 'Land', 'Office', 'Other'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const OWNERSHIPS = ['Owned', 'Rented', 'Family', 'Other'] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

export const VEHICLE_KINDS = ['Car', 'Motorcycle', 'Scooter', 'Bicycle', 'Other'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const FUEL_UNITS = ['Litre', 'Kg', 'kWh'] as const;
export type FuelUnit = (typeof FUEL_UNITS)[number];

export const WARRANTY_KINDS = ['Warranty', 'Extended', 'AMC'] as const;
export type WarrantyKind = (typeof WARRANTY_KINDS)[number];

export const DISPOSAL_KINDS = ['Sold', 'Donated', 'Discarded', 'Lost'] as const;
export type DisposalKind = (typeof DISPOSAL_KINDS)[number];

/** What a warranty covers or maintenance is for — the linkable type strings. */
export type HomeTargetType = 'Asset' | 'Vehicle' | 'Property';

export type HomeAgendaKind = 'Warranty' | 'Puc' | 'Registration' | 'Maintenance' | 'Bill';

export interface Property {
  id: number;
  name: string;
  kind: PropertyKind;
  ownership: Ownership;
  address: string | null;
  movedInOn: string | null;
  movedOutOn: string | null;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  notes: string | null;
  /** Things in the inventory there (not let go). */
  assetCount: number;
}

export interface PropertyPayload {
  name: string;
  kind: PropertyKind;
  ownership: Ownership;
  address: string | null;
  movedInOn: string | null;
  movedOutOn: string | null;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  notes: string | null;
}

/** Something in the inventory. Categories are tags; a disposal takes it out of the inventory, never deletes it. */
export interface Asset {
  id: number;
  name: string;
  propertyId: number | null;
  propertyName: string | null;
  room: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantity: number;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  disposedOn: string | null;
  disposalKind: DisposalKind | null;
  disposalAmount: number | null;
  notes: string | null;
  tags: Tag[];
  /** The latest expiry among its warranties/AMCs. */
  coveredUntil: string | null;
}

export interface AssetPayload {
  name: string;
  propertyId: number | null;
  room: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantity: number;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  notes: string | null;
  tagIds: number[];
  today: string;
}

export interface DisposalPayload {
  /** Null takes it back into the inventory. */
  kind: DisposalKind | null;
  on: string | null;
  amount: number | null;
  currency: string | null;
  today: string;
}

export interface Vehicle {
  id: number;
  name: string;
  kind: VehicleKind;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  registrationNumber: string | null;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  insurancePolicyId: number | null;
  insurancePolicyName: string | null;
  insuranceRenewsOn: string | null;
  insuranceEndsOn: string | null;
  pucValidUntil: string | null;
  registrationValidUntil: string | null;
  reminderDays: number | null;
  disposedOn: string | null;
  disposalKind: DisposalKind | null;
  disposalAmount: number | null;
  notes: string | null;
  odometerKm: number | null;
  nextServiceTaskId: number | null;
  nextServiceTitle: string | null;
  nextServiceOn: string | null;
  fuelUnit: FuelUnit;
  /** The overall average of the current run of fills (null until two fills). */
  mileage: FuelAverage | null;
  fuelFills: number;
}

/** Mileage from partial fills: distance ÷ the fuel of every fill but the latest (FuelEconomy on the server). */
export interface FuelAverage {
  perUnit: number;
  distanceKm: number;
  fuelUsed: number;
  fills: number;
  /** Only when the fuel burnt was all paid in one currency. */
  costPerKm: number | null;
  currency: string | null;
}

export interface FuelFill {
  id: number;
  vehicleId: number;
  filledOn: string;
  odometerKm: number;
  amount: number;
  currency: string;
  /** Both filled in — whichever wasn't entered is worked out (quantityGiven says which). */
  pricePerUnit: number;
  quantity: number;
  quantityGiven: boolean;
  missedFillBefore: boolean;
  transactionId: number | null;
  paidFromAccountName: string | null;
  notes: string | null;
}

export interface FuelTrendPoint {
  fillId: number;
  filledOn: string;
  odometerKm: number;
  perUnit: number;
}

export interface FuelMonth {
  /** The month's first day. */
  monthStart: string;
  currency: string;
  amount: number;
}

export interface FuelHistory {
  vehicleId: number;
  fuelUnit: FuelUnit;
  /** Newest first. */
  fills: FuelFill[];
  average: FuelAverage | null;
  trend: FuelTrendPoint[];
  monthly: FuelMonth[];
}

export interface FuelExpensePayload {
  accountId: number;
  exchangeRate: number | null;
  tagIds: number[];
}

export interface FuelFillPayload {
  filledOn: string;
  odometerKm: number;
  amount: number;
  currency: string;
  /** The price per unit or the quantity — never both. */
  pricePerUnit: number | null;
  quantity: number | null;
  missedFillBefore: boolean;
  notes: string | null;
  /** On create only: record it in Finance. */
  expense: FuelExpensePayload | null;
  today: string;
}

export interface VehiclePayload {
  name: string;
  kind: VehicleKind;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  registrationNumber: string | null;
  purchasedOn: string | null;
  purchasePrice: number | null;
  currency: string | null;
  insurancePolicyId: number | null;
  pucValidUntil: string | null;
  registrationValidUntil: string | null;
  reminderDays: number | null;
  fuelUnit: FuelUnit;
  notes: string | null;
  today: string;
  timeZone: string;
}

export interface Warranty {
  id: number;
  kind: WarrantyKind;
  coverType: HomeTargetType;
  coverId: number;
  coverName: string;
  /** What it covers has been let go. */
  coverDisposed: boolean;
  provider: string | null;
  startsOn: string | null;
  expiresOn: string;
  cost: number | null;
  currency: string | null;
  contactId: number | null;
  contactName: string | null;
  reminderDays: number | null;
  notes: string | null;
}

export interface WarrantyPayload {
  kind: WarrantyKind;
  coverType: HomeTargetType;
  coverId: number;
  provider: string | null;
  startsOn: string | null;
  expiresOn: string;
  cost: number | null;
  currency: string | null;
  contactId: number | null;
  reminderDays: number | null;
  notes: string | null;
  timeZone: string;
}

/** Maintenance that comes round again; nextDueOn is computed by the server, never stored. */
export interface MaintenanceTask {
  id: number;
  title: string;
  targetType: HomeTargetType | null;
  targetId: number | null;
  targetName: string | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  firstDueOn: string;
  isPaused: boolean;
  contactId: number | null;
  contactName: string | null;
  reminderDays: number | null;
  notes: string | null;
  lastDoneOn: string | null;
  timesDone: number;
  nextDueOn: string;
}

export interface MaintenancePayload {
  title: string;
  targetType: HomeTargetType | null;
  targetId: number | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  firstDueOn: string;
  isPaused: boolean;
  contactId: number | null;
  reminderDays: number | null;
  notes: string | null;
  timeZone: string;
}

export interface MaintenanceLog {
  id: number;
  maintenanceTaskId: number;
  doneOn: string;
  cost: number | null;
  currency: string | null;
  odometerKm: number | null;
  transactionId: number | null;
  notes: string | null;
}

export interface MaintenanceDonePayload {
  doneOn: string;
  cost: number | null;
  currency: string | null;
  odometerKm: number | null;
  notes: string | null;
  today: string;
  timeZone: string;
}

export const BILL_KINDS = [
  'Electricity',
  'Water',
  'Gas',
  'Internet',
  'Phone',
  'Maintenance',
  'Rent',
  'Other',
] as const;
export type BillKind = (typeof BILL_KINDS)[number];

/** A bill for running the house; paying it can record one Finance expense (transactionId). */
export interface UtilityBill {
  id: number;
  propertyId: number | null;
  propertyName: string | null;
  kind: BillKind;
  provider: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueOn: string;
  amount: number;
  currency: string;
  unitsUsed: number | null;
  paidOn: string | null;
  transactionId: number | null;
  paidFromAccountName: string | null;
  notes: string | null;
}

export interface UtilityBillPayload {
  propertyId: number | null;
  kind: BillKind;
  provider: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueOn: string;
  amount: number;
  currency: string;
  unitsUsed: number | null;
  notes: string | null;
}

export interface BillPaidPayload {
  paidOn: string;
  /** Null: paid, but not recorded in Finance. */
  accountId: number | null;
  exchangeRate: number | null;
  tagIds: number[];
  today: string;
}

export interface Money {
  currency: string;
  amount: number;
}

/** A tasks project with a property and a budget; spent = Finance expenses linked to the project. */
export interface HouseholdProject {
  id: number;
  projectId: number;
  name: string;
  status: 'Active' | 'Completed' | 'Archived';
  description: string | null;
  propertyId: number | null;
  propertyName: string | null;
  budget: number | null;
  currency: string | null;
  openTasks: number;
  doneTasks: number;
  spent: Money[];
  budgetPercent: number | null;
}

export interface HouseholdProjectPayload {
  name: string;
  description: string | null;
  status: HouseholdProject['status'];
  propertyId: number | null;
  budget: number | null;
  currency: string | null;
}

/** Something at home needing attention soon (a warranty/PUC/registration running out, maintenance due). */
export interface HomeAgendaItem {
  kind: HomeAgendaKind;
  /** What opening it opens: Warranty / Vehicle / MaintenanceTask. */
  entityType: 'Warranty' | 'Vehicle' | 'MaintenanceTask' | 'UtilityBill';
  entityId: number;
  title: string;
  on: string;
}

/** Home & assets (`api/Home/*`). Saves that move an owned reminder tell the reminders list to refresh. */
@Injectable({ providedIn: 'root' })
export class HomeService {
  private readonly http = inject(HttpClient);
  private readonly remindersService = inject(RemindersService);
  private readonly base = '/api/Home';

  // ---- Properties ----

  properties(): Observable<Property[]> {
    return this.http
      .get<ApiResponse<Property[]>>(`${this.base}/Properties`)
      .pipe(map((response) => response.data ?? []));
  }

  property(id: number): Observable<Property> {
    return this.http
      .get<ApiResponse<Property>>(`${this.base}/Properties/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveProperty(id: number | null, payload: PropertyPayload): Observable<Property> {
    const request = id
      ? this.http.put<ApiResponse<Property>>(`${this.base}/Properties/${id}`, payload)
      : this.http.post<ApiResponse<Property>>(`${this.base}/Properties`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Warranties on the property go (with their reminders). */
  removeProperty(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Properties/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Inventory ----

  assets(includeDisposed = false): Observable<Asset[]> {
    const params = includeDisposed ? new HttpParams().set('includeDisposed', true) : undefined;
    return this.http
      .get<ApiResponse<Asset[]>>(`${this.base}/Assets`, { params })
      .pipe(map((response) => response.data ?? []));
  }

  asset(id: number): Observable<Asset> {
    return this.http
      .get<ApiResponse<Asset>>(`${this.base}/Assets/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveAsset(id: number | null, payload: AssetPayload): Observable<Asset> {
    const request = id
      ? this.http.put<ApiResponse<Asset>>(`${this.base}/Assets/${id}`, payload)
      : this.http.post<ApiResponse<Asset>>(`${this.base}/Assets`, payload);
    return request.pipe(map((response) => response.data!));
  }

  setAssetDisposal(id: number, payload: DisposalPayload): Observable<Asset> {
    return this.http
      .put<ApiResponse<Asset>>(`${this.base}/Assets/${id}/disposal`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Its warranties go with it (and their reminders). */
  removeAsset(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Assets/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Vehicles ----

  vehicles(): Observable<Vehicle[]> {
    return this.http
      .get<ApiResponse<Vehicle[]>>(`${this.base}/Vehicles`)
      .pipe(map((response) => response.data ?? []));
  }

  vehicle(id: number): Observable<Vehicle> {
    return this.http
      .get<ApiResponse<Vehicle>>(`${this.base}/Vehicles/${id}`)
      .pipe(map((response) => response.data!));
  }

  /** Saving moves (or removes) the PUC and registration reminders. */
  saveVehicle(id: number | null, payload: VehiclePayload): Observable<Vehicle> {
    const request = id
      ? this.http.put<ApiResponse<Vehicle>>(`${this.base}/Vehicles/${id}`, payload)
      : this.http.post<ApiResponse<Vehicle>>(`${this.base}/Vehicles`, payload);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  setVehicleDisposal(id: number, payload: DisposalPayload): Observable<Vehicle> {
    return this.http
      .put<ApiResponse<Vehicle>>(`${this.base}/Vehicles/${id}/disposal`, payload)
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  removeVehicle(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Vehicles/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Fuel ----

  fuelHistory(vehicleId: number): Observable<FuelHistory> {
    return this.http
      .get<ApiResponse<FuelHistory>>(`${this.base}/Vehicles/${vehicleId}/fuel`)
      .pipe(map((response) => response.data!));
  }

  /** With `expense`, one Finance expense is recorded for the fill too. */
  saveFuelFill(
    vehicleId: number,
    id: number | null,
    payload: FuelFillPayload,
  ): Observable<FuelFill> {
    const url = `${this.base}/Vehicles/${vehicleId}/fuel`;
    const request = id
      ? this.http.put<ApiResponse<FuelFill>>(`${url}/${id}`, payload)
      : this.http.post<ApiResponse<FuelFill>>(url, payload);
    return request.pipe(map((response) => response.data!));
  }

  recordFuelExpense(
    vehicleId: number,
    id: number,
    payload: FuelExpensePayload,
  ): Observable<FuelFill> {
    return this.http
      .put<ApiResponse<FuelFill>>(`${this.base}/Vehicles/${vehicleId}/fuel/${id}/expense`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Takes the expense the fill created back out of Finance. */
  removeFuelExpense(vehicleId: number, id: number): Observable<FuelFill> {
    return this.http
      .delete<ApiResponse<FuelFill>>(`${this.base}/Vehicles/${vehicleId}/fuel/${id}/expense`)
      .pipe(map((response) => response.data!));
  }

  /** Deletes the fill and the expense it created. */
  removeFuelFill(vehicleId: number, id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/Vehicles/${vehicleId}/fuel/${id}`)
      .pipe(map(() => undefined));
  }

  // ---- Warranties ----

  warranties(): Observable<Warranty[]> {
    return this.http
      .get<ApiResponse<Warranty[]>>(`${this.base}/Warranties`)
      .pipe(map((response) => response.data ?? []));
  }

  warranty(id: number): Observable<Warranty> {
    return this.http
      .get<ApiResponse<Warranty>>(`${this.base}/Warranties/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveWarranty(id: number | null, payload: WarrantyPayload): Observable<Warranty> {
    const request = id
      ? this.http.put<ApiResponse<Warranty>>(`${this.base}/Warranties/${id}`, payload)
      : this.http.post<ApiResponse<Warranty>>(`${this.base}/Warranties`, payload);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  removeWarranty(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Warranties/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Maintenance ----

  maintenance(): Observable<MaintenanceTask[]> {
    return this.http
      .get<ApiResponse<MaintenanceTask[]>>(`${this.base}/Maintenance`)
      .pipe(map((response) => response.data ?? []));
  }

  maintenanceTask(id: number): Observable<MaintenanceTask> {
    return this.http
      .get<ApiResponse<MaintenanceTask>>(`${this.base}/Maintenance/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveMaintenance(id: number | null, payload: MaintenancePayload): Observable<MaintenanceTask> {
    const request = id
      ? this.http.put<ApiResponse<MaintenanceTask>>(`${this.base}/Maintenance/${id}`, payload)
      : this.http.post<ApiResponse<MaintenanceTask>>(`${this.base}/Maintenance`, payload);
    return request.pipe(
      tap(() => this.remindersService.notifyChanged()),
      map((response) => response.data!),
    );
  }

  removeMaintenance(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/Maintenance/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  maintenanceLogs(id: number): Observable<MaintenanceLog[]> {
    return this.http
      .get<ApiResponse<MaintenanceLog[]>>(`${this.base}/Maintenance/${id}/logs`)
      .pipe(map((response) => response.data ?? []));
  }

  /** Logs it done; the next due day and its reminder move on. */
  markDone(id: number, payload: MaintenanceDonePayload): Observable<MaintenanceTask> {
    return this.http
      .post<ApiResponse<MaintenanceTask>>(`${this.base}/Maintenance/${id}/done`, payload)
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  removeLog(id: number, logId: number): Observable<MaintenanceTask> {
    const params = new HttpParams().set('timeZone', browserTimeZone());
    return this.http
      .delete<ApiResponse<MaintenanceTask>>(`${this.base}/Maintenance/${id}/logs/${logId}`, {
        params,
      })
      .pipe(
        tap(() => this.remindersService.notifyChanged()),
        map((response) => response.data!),
      );
  }

  // ---- Bills ----

  bills(): Observable<UtilityBill[]> {
    return this.http
      .get<ApiResponse<UtilityBill[]>>(`${this.base}/UtilityBills`)
      .pipe(map((response) => response.data ?? []));
  }

  bill(id: number): Observable<UtilityBill> {
    return this.http
      .get<ApiResponse<UtilityBill>>(`${this.base}/UtilityBills/${id}`)
      .pipe(map((response) => response.data!));
  }

  saveBill(id: number | null, payload: UtilityBillPayload): Observable<UtilityBill> {
    const request = id
      ? this.http.put<ApiResponse<UtilityBill>>(`${this.base}/UtilityBills/${id}`, payload)
      : this.http.post<ApiResponse<UtilityBill>>(`${this.base}/UtilityBills`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Paid; with an account, one Finance expense is recorded for it. */
  payBill(id: number, payload: BillPaidPayload): Observable<UtilityBill> {
    return this.http
      .put<ApiResponse<UtilityBill>>(`${this.base}/UtilityBills/${id}/paid`, payload)
      .pipe(map((response) => response.data!));
  }

  /** Takes the payment back, and the expense it created. */
  unpayBill(id: number): Observable<UtilityBill> {
    return this.http
      .delete<ApiResponse<UtilityBill>>(`${this.base}/UtilityBills/${id}/paid`)
      .pipe(map((response) => response.data!));
  }

  removeBill(id: number): Observable<void> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/UtilityBills/${id}`).pipe(
      tap(() => this.remindersService.notifyChanged()),
      map(() => undefined),
    );
  }

  // ---- Household projects ----

  householdProjects(): Observable<HouseholdProject[]> {
    return this.http
      .get<ApiResponse<HouseholdProject[]>>(`${this.base}/HouseholdProjects`)
      .pipe(map((response) => response.data ?? []));
  }

  saveHouseholdProject(
    id: number | null,
    payload: HouseholdProjectPayload,
  ): Observable<HouseholdProject> {
    const request = id
      ? this.http.put<ApiResponse<HouseholdProject>>(
          `${this.base}/HouseholdProjects/${id}`,
          payload,
        )
      : this.http.post<ApiResponse<HouseholdProject>>(`${this.base}/HouseholdProjects`, payload);
    return request.pipe(map((response) => response.data!));
  }

  /** Stops tracking it as a household project; the tasks project stays. */
  removeHouseholdProject(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<boolean>>(`${this.base}/HouseholdProjects/${id}`)
      .pipe(map(() => undefined));
  }

  // ---- Coming up ----

  agenda(today: string): Observable<HomeAgendaItem[]> {
    return this.http
      .get<ApiResponse<HomeAgendaItem[]>>(`${this.base}/Agenda`, {
        params: new HttpParams().set('today', today),
      })
      .pipe(map((response) => response.data ?? []));
  }
}
