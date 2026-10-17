import type { NavGroup } from '../layout/nav-items';
import type { ModuleKey } from '../services/settings.service';

/**
 * What the user has switched off, applied to the navigation and the life-area pickers (pure, specced). Hiding is
 * presentation only: the data stays and a page's URL still opens.
 */

/** The navigation without hidden modules' entries; a group left with nothing disappears. */
export function visibleNavGroups(
  groups: readonly NavGroup[],
  hidden: ReadonlySet<ModuleKey>,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.module || !hidden.has(item.module)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The life areas a picker offers: the ones switched on, plus the one already chosen even if it has been switched
 * off since — otherwise editing an old goal would blank its area.
 */
export function pickableLifeAreas<T extends { id: number }>(
  areas: readonly T[],
  hidden: ReadonlySet<number>,
  currentId: number | null | undefined,
): T[] {
  return areas.filter((area) => !hidden.has(area.id) || area.id === currentId);
}
