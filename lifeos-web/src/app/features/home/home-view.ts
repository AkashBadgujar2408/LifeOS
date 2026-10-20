import {
  Asset,
  BillKind,
  UtilityBill,
  DisposalKind,
  FuelUnit,
  HomeAgendaItem,
  HomeTargetType,
  Ownership,
  PropertyKind,
  Vehicle,
  VehicleKind,
  WarrantyKind,
} from '../../core/services/home.service';
import { daysBetween } from '../dashboard/my-day-view';
import { formatMoney } from '../finance/finance-view';

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  House: 'House',
  Apartment: 'Apartment',
  Land: 'Land',
  Office: 'Office',
  Other: 'Other',
};

export const PROPERTY_KIND_ICONS: Record<PropertyKind, string> = {
  House: 'bi-house',
  Apartment: 'bi-building',
  Land: 'bi-tree',
  Office: 'bi-briefcase',
  Other: 'bi-geo-alt',
};

export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  Owned: 'Owned',
  Rented: 'Rented',
  Family: 'Family home',
  Other: 'Other',
};

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  Car: 'Car',
  Motorcycle: 'Motorcycle',
  Scooter: 'Scooter',
  Bicycle: 'Bicycle',
  Other: 'Other',
};

export const FUEL_UNIT_LABELS: Record<FuelUnit, string> = {
  Litre: 'Litres (petrol, diesel)',
  Kg: 'Kilograms (CNG)',
  kWh: 'kWh (electric)',
};

/** The short unit after a number: "4.81 L", "km/L". */
export const FUEL_UNIT_SHORT: Record<FuelUnit, string> = { Litre: 'L', Kg: 'kg', kWh: 'kWh' };

/** "62.4 km/L" — the overall average, one decimal. */
export function mileageText(perUnit: number, unit: FuelUnit): string {
  return `${perUnit.toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km/${FUEL_UNIT_SHORT[unit]}`;
}

/**
 * The vehicle card's line: "62.4 km/L over 300 km · ₹1.67/km" (cost per km only when the fuel was paid in one
 * currency), or what's still needed for an average.
 */
export function mileageLine(vehicle: Pick<Vehicle, 'mileage' | 'fuelUnit' | 'fuelFills'>): string {
  const m = vehicle.mileage;
  if (!m) {
    return vehicle.fuelFills === 0
      ? 'No fills logged yet.'
      : 'Log one more fill to see the mileage.';
  }
  const parts = [
    `${mileageText(m.perUnit, vehicle.fuelUnit)} over ${m.distanceKm.toLocaleString('en-IN')} km`,
  ];
  if (m.costPerKm !== null && m.currency) {
    parts.push(`${formatMoney(m.costPerKm, m.currency)}/km`);
  }
  return parts.join(' · ');
}

/** The average as it stood after each fill, by fill id (fills that complete no run have none). */
export function fuelTrendByFill(
  trend: readonly { fillId: number; perUnit: number }[],
): Map<number, number> {
  return new Map(trend.map((p) => [p.fillId, p.perUnit]));
}

export const VEHICLE_KIND_ICONS: Record<VehicleKind, string> = {
  Car: 'bi-car-front',
  Motorcycle: 'bi-bicycle',
  Scooter: 'bi-scooter',
  Bicycle: 'bi-bicycle',
  Other: 'bi-truck',
};

export const WARRANTY_KIND_LABELS: Record<WarrantyKind, string> = {
  Warranty: 'Warranty',
  Extended: 'Extended warranty',
  AMC: 'AMC (maintenance contract)',
};

export const DISPOSAL_KIND_LABELS: Record<DisposalKind, string> = {
  Sold: 'Sold',
  Donated: 'Donated',
  Discarded: 'Thrown away',
  Lost: 'Lost',
};

export const HOME_TARGET_LABELS: Record<HomeTargetType, string> = {
  Asset: 'Belonging',
  Vehicle: 'Vehicle',
  Property: 'Property',
};

export const AGENDA_ICONS: Record<HomeAgendaItem['kind'], string> = {
  Warranty: 'bi-patch-check',
  Puc: 'bi-wind',
  Registration: 'bi-card-heading',
  Maintenance: 'bi-tools',
  Bill: 'bi-receipt',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface DayStatus {
  /** past: ran out / overdue; today; soon: within the window; later. */
  state: 'past' | 'today' | 'soon' | 'later';
  days: number;
  label: string;
}

/** A day something runs out (warranty, PUC, registration), against today: "Runs out in 21 days", "Ran out 3 days ago". */
export function runsOutStatus(on: string, today: string, soonDays = 60): DayStatus {
  const days = daysBetween(today, on);
  if (days < 0) {
    return {
      state: 'past',
      days,
      label: days === -1 ? 'Ran out yesterday' : `Ran out ${plural(-days, 'day', 'days')} ago`,
    };
  }
  if (days === 0) {
    return { state: 'today', days, label: 'Runs out today' };
  }
  return {
    state: days <= soonDays ? 'soon' : 'later',
    days,
    label: days === 1 ? 'Runs out tomorrow' : `Runs out in ${plural(days, 'day', 'days')}`,
  };
}

/** When maintenance is due, against today: "Due in 5 days", "Overdue by 3 days". */
export function dueStatus(on: string, today: string, soonDays = 14): DayStatus {
  const days = daysBetween(today, on);
  if (days < 0) {
    return { state: 'past', days, label: `Overdue by ${plural(-days, 'day', 'days')}` };
  }
  if (days === 0) {
    return { state: 'today', days, label: 'Due today' };
  }
  return {
    state: days <= soonDays ? 'soon' : 'later',
    days,
    label: days === 1 ? 'Due tomorrow' : `Due in ${plural(days, 'day', 'days')}`,
  };
}

/** An agenda line's status: maintenance and bills are due, the rest run out. */
export function agendaStatus(item: HomeAgendaItem, today: string): DayStatus {
  return item.kind === 'Maintenance' || item.kind === 'Bill'
    ? dueStatus(item.on, today)
    : runsOutStatus(item.on, today);
}

export interface RoomGroup {
  /** Stable key for tracking. */
  key: string;
  propertyName: string | null;
  room: string | null;
  assets: Asset[];
  /** Items counted with their quantity (4 chairs = 4). */
  count: number;
}

const byText = (a: string | null, b: string | null) =>
  a === b
    ? 0
    : a === null
      ? 1
      : b === null
        ? -1
        : a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * The inventory by where things are: property A–Z (no property last), then room A–Z (no room last), names A–Z
 * inside. Rooms are free text, so "kitchen" and "Kitchen " are one room (shown as first written).
 */
export function groupByRoom(assets: readonly Asset[]): RoomGroup[] {
  const groups = new Map<string, RoomGroup>();
  for (const asset of assets) {
    const room = asset.room?.trim() || null;
    const key = `${asset.propertyId ?? ''}|${room?.toLocaleLowerCase() ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, propertyName: asset.propertyName, room, assets: [], count: 0 };
      groups.set(key, group);
    }
    group.assets.push(asset);
    group.count += asset.quantity;
  }
  const sorted = [...groups.values()].sort(
    (a, b) => byText(a.propertyName, b.propertyName) || byText(a.room, b.room),
  );
  for (const group of sorted) {
    group.assets.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  return sorted;
}

/** Rooms already used (for the room box's suggestions), in one property when given, A–Z, each once. */
export function knownRooms(assets: readonly Asset[], propertyId: number | null = null): string[] {
  const seen = new Map<string, string>();
  for (const asset of assets) {
    const room = asset.room?.trim();
    if (room && (propertyId === null || asset.propertyId === propertyId)) {
      const key = room.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.set(key, room);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Inventory filter: name, brand, model, serial number, room or a tag containing the text (any case). */
export function filterAssets(
  assets: readonly Asset[],
  text: string,
  tagId: number | null,
): Asset[] {
  const needle = text.trim().toLocaleLowerCase();
  return assets.filter(
    (a) =>
      (tagId === null || a.tags.some((t) => t.id === tagId)) &&
      (!needle ||
        [a.name, a.brand, a.model, a.serialNumber, a.room, ...a.tags.map((t) => t.name)].some(
          (value) => value?.toLocaleLowerCase().includes(needle),
        )),
  );
}

export const BILL_KIND_LABELS: Record<BillKind, string> = {
  Electricity: 'Electricity',
  Water: 'Water',
  Gas: 'Gas',
  Internet: 'Internet',
  Phone: 'Phone',
  Maintenance: 'Society maintenance',
  Rent: 'Rent',
  Other: 'Other',
};

export const BILL_KIND_ICONS: Record<BillKind, string> = {
  Electricity: 'bi-lightning-charge',
  Water: 'bi-droplet',
  Gas: 'bi-fire',
  Internet: 'bi-wifi',
  Phone: 'bi-phone',
  Maintenance: 'bi-building',
  Rent: 'bi-key',
  Other: 'bi-receipt',
};

export interface BillKindTotal {
  kind: BillKind;
  currency: string;
  total: number;
  count: number;
}

/**
 * What each kind of bill came to over a span (bills *due* from `from` to `to`, paid or not), per currency, biggest
 * first — "what the house costs to run".
 */
export function billTotals(
  bills: readonly UtilityBill[],
  from: string,
  to: string,
): BillKindTotal[] {
  const totals = new Map<string, BillKindTotal>();
  for (const bill of bills) {
    if (bill.dueOn < from || bill.dueOn > to) {
      continue;
    }
    const key = `${bill.kind}|${bill.currency}`;
    const entry = totals.get(key) ?? {
      kind: bill.kind,
      currency: bill.currency,
      total: 0,
      count: 0,
    };
    entry.total += bill.amount;
    entry.count += 1;
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind));
}
