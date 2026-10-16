export interface NavItem {
  label: string;
  route: string;
  icon: string;
  /** Exact-match active state; needed for '/' so it isn't "active" on every page. */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The blueprint's navigation groups, trimmed to the modules built so far, plus "Your story" (Story Mode, Phase 2).
 * Later phases add groups (Life administration, Experiences, Insights) and items here — the shell renders whatever
 * this list contains.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'My Day', route: '/', icon: 'bi-sun', exact: true },
      { label: 'Inbox', route: '/inbox', icon: 'bi-inbox' },
      { label: 'Calendar', route: '/calendar', icon: 'bi-calendar3' },
      { label: 'Reminders', route: '/reminders', icon: 'bi-bell' },
    ],
  },
  {
    label: 'Planning & growth',
    items: [
      { label: 'Goals', route: '/goals', icon: 'bi-flag' },
      { label: 'Tasks', route: '/tasks', icon: 'bi-check2-square' },
      { label: 'Projects', route: '/projects', icon: 'bi-kanban' },
      { label: 'Habits', route: '/habits', icon: 'bi-arrow-repeat' },
    ],
  },
  {
    label: 'Wellbeing',
    items: [{ label: 'Journal', route: '/journal', icon: 'bi-journal-text' }],
  },
  {
    label: 'Your story',
    items: [
      { label: 'Story', route: '/story', icon: 'bi-book' },
      { label: 'Missions', route: '/missions', icon: 'bi-compass' },
      { label: 'Life areas', route: '/life-areas', icon: 'bi-bar-chart-steps' },
    ],
  },
  {
    label: 'System',
    items: [{ label: 'Tags', route: '/tags', icon: 'bi-tags' }],
  },
];
