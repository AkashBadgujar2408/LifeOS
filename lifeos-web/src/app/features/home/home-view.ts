import {
  Asset,
  DisposalKind,
  HomeAgendaItem,
  HomeTargetType,
  Ownership,
  PropertyKind,
  VehicleKind,
  WarrantyKind,
} from '../../core/services/home.service';
import { daysBetween } from '../dashboard/my-day-view';

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

/** An agenda line's status: maintenance is due, the rest run out. */
export function agendaStatus(item: HomeAgendaItem, today: string): DayStatus {
  return item.kind === 'Maintenance' ? dueStatus(item.on, today) : runsOutStatus(item.on, today);
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
