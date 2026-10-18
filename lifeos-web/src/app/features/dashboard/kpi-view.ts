import type { KpiDefinition, KpiTile, KpiUnit } from '../../core/services/dashboard.service';
import type { ModuleKey } from '../../core/services/settings.service';

/** A tile's number as it reads: "12", "87%", "1h 45m" (minutes); a dash when there's nothing to measure. */
export function kpiValueText(value: number | null, unit: KpiUnit): string {
  if (value === null) {
    return '—';
  }
  switch (unit) {
    case 'Percent':
      return `${value}%`;
    case 'Minutes': {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      if (hours === 0) {
        return `${minutes}m`;
      }
      return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
    }
    default:
      return String(value);
  }
}

/**
 * How the tile compares with the period before, in words: "Up 3 on last week", "Same as the 30 days before", or
 * "12 last week" when there's no current figure. Direction only — no good/bad colouring, since more isn't always
 * better (and LifeOS doesn't scold). Null for tiles that don't compare.
 */
export function kpiComparison(tile: KpiTile): string | null {
  if (!tile.comparedWith || tile.previous === null) {
    return null;
  }
  if (tile.value === null) {
    return `${kpiValueText(tile.previous, tile.unit)} ${tile.comparedWith}`;
  }
  const difference = tile.value - tile.previous;
  if (difference === 0) {
    return `Same as ${tile.comparedWith}`;
  }
  const amount =
    tile.unit === 'Percent'
      ? `${Math.abs(difference)} points`
      : kpiValueText(Math.abs(difference), tile.unit);
  return `${difference > 0 ? 'Up' : 'Down'} ${amount} on ${tile.comparedWith}`;
}

/** Tiles and choices without the modules switched off in Settings (their data stays; the tile just isn't shown). */
export function visibleKpis<T extends KpiDefinition>(
  items: readonly T[],
  hidden: ReadonlySet<ModuleKey>,
): T[] {
  return items.filter((item) => !hidden.has(item.module));
}

/** Moves a chosen key up (-1) or down (+1) in the list; out-of-range moves leave it as it is. */
export function moveKey(keys: readonly string[], key: string, by: -1 | 1): string[] {
  const from = keys.indexOf(key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= keys.length) {
    return [...keys];
  }
  const next = [...keys];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
