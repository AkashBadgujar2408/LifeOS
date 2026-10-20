import type { NavItem } from '../../core/layout/nav-items';

/** Family's log pages (Session 74) — added to the Family group in nav-items.ts. */
export const FAMILY_LOG_NAV: NavItem[] = [
  {
    label: 'Keep in touch',
    route: '/family/keep-in-touch',
    icon: 'bi-telephone-outbound',
    module: 'Family',
  },
  {
    label: 'Times in touch',
    route: '/family/interactions',
    icon: 'bi-chat-heart',
    module: 'Family',
  },
  {
    label: 'Responsibilities',
    route: '/family/responsibilities',
    icon: 'bi-people',
    module: 'Family',
  },
];
