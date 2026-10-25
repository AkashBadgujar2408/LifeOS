import type { NavGroup, NavItem } from './nav-items';

/**
 * The navigation's own logic (Session 97a, pure and specced): which group holds the page you're on — so the
 * two-level sidebar can open it by itself — and which pages match what's typed in search.
 */

/** Whether a nav entry is the page at `url` (or one of its sub-pages, unless the entry is exact). */
function covers(item: NavItem, path: string): boolean {
  return item.exact
    ? path === item.route
    : path === item.route || path.startsWith(item.route + '/');
}

/**
 * The group of the entry that best covers `url` (the longest matching route, so `/finance/loans/7` is Loans, not
 * Accounts), or null for a page that isn't in the navigation.
 */
export function groupForUrl(groups: readonly NavGroup[], url: string): string | null {
  const path = url.split(/[?#]/)[0] || '/';
  let best: { group: string; length: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (covers(item, path) && (best === null || item.route.length > best.length)) {
        best = { group: group.label, length: item.route.length };
      }
    }
  }
  return best?.group ?? null;
}

export interface PageMatch {
  label: string;
  group: string;
  route: string;
  icon: string;
}

/**
 * Nav pages matching a query: every typed word has to start a word of the page's name or its group's ("net" finds
 * Net worth, "money loans" finds Loans, "health" finds every Health page). Pages whose name starts with the query
 * come first, then ones with a name word starting with it, then group-only matches; ties keep the sidebar's order.
 */
export function matchPages(groups: readonly NavGroup[], query: string, limit = 6): PageMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const startsAWord = (text: string, word: string) =>
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .some((part) => part.startsWith(word));

  const seen = new Set<string>();
  const ranked: { page: PageMatch; rank: number; order: number }[] = [];
  let order = 0;
  for (const group of groups) {
    for (const item of group.items) {
      order++;
      if (seen.has(item.route)) {
        continue;
      }
      const haystack = `${item.label} ${group.label}`;
      if (!words.every((word) => startsAWord(haystack, word))) {
        continue;
      }
      seen.add(item.route);
      const label = item.label.toLowerCase();
      const rank = label.startsWith(words.join(' '))
        ? 0
        : words.every((word) => startsAWord(item.label, word))
          ? 1
          : 2;
      ranked.push({
        page: { label: item.label, group: group.label, route: item.route, icon: item.icon },
        rank,
        order,
      });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.page);
}

/**
 * The group open in the sidebar (one at a time), remembered per browser — a convenience: unreadable storage just
 * means the default.
 */
const OPEN_GROUPS_KEY = 'lifeos.nav.openGroups';
export const DEFAULT_OPEN_GROUPS = ['Overview'];

export function readOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const stored = Array.isArray(parsed)
      ? parsed.filter((g): g is string => typeof g === 'string')
      : DEFAULT_OPEN_GROUPS;
    // One at a time: an older list of several keeps its last.
    return new Set(stored.slice(-1));
  } catch {
    return new Set(DEFAULT_OPEN_GROUPS);
  }
}

export function writeOpenGroups(open: ReadonlySet<string>): void {
  try {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...open]));
  } catch {
    // Private window or blocked storage: the sidebar still works, it just won't remember.
  }
}
