import type { ModuleKey } from '../services/settings.service';

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  /** Exact-match active state; needed for '/' so it isn't "active" on every page. */
  exact?: boolean;
  /** The module this entry belongs to: switching that module off in Settings hides it. */
  module?: ModuleKey;
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
      { label: 'Calendar', route: '/calendar', icon: 'bi-calendar3', module: 'Calendar' },
      { label: 'Reminders', route: '/reminders', icon: 'bi-bell', module: 'Reminders' },
    ],
  },
  {
    label: 'Planning & growth',
    items: [
      { label: 'Goals', route: '/goals', icon: 'bi-flag', module: 'Goals' },
      { label: 'Tasks', route: '/tasks', icon: 'bi-check2-square', module: 'Tasks' },
      { label: 'Projects', route: '/projects', icon: 'bi-kanban', module: 'Projects' },
      { label: 'Habits', route: '/habits', icon: 'bi-arrow-repeat', module: 'Habits' },
    ],
  },
  {
    label: 'Learning',
    items: [
      { label: 'Skills', route: '/learning/skills', icon: 'bi-mortarboard', module: 'Learning' },
      { label: 'Courses', route: '/learning/courses', icon: 'bi-easel', module: 'Learning' },
      { label: 'Reading', route: '/learning/books', icon: 'bi-book-half', module: 'Learning' },
      {
        label: 'Roadmaps',
        route: '/learning/roadmaps',
        icon: 'bi-signpost-split',
        module: 'Learning',
      },
      { label: 'Study', route: '/learning/study', icon: 'bi-stopwatch', module: 'Learning' },
      {
        label: 'Notes & review',
        route: '/learning/notes',
        icon: 'bi-card-text',
        module: 'Learning',
      },
      {
        label: 'Certifications',
        route: '/learning/certifications',
        icon: 'bi-patch-check',
        module: 'Learning',
      },
    ],
  },
  {
    label: 'Career',
    items: [
      { label: 'Timeline', route: '/career', icon: 'bi-briefcase', exact: true, module: 'Career' },
      { label: 'Salary', route: '/career/salary', icon: 'bi-cash-stack', module: 'Career' },
      {
        label: 'Achievements',
        route: '/career/achievements',
        icon: 'bi-trophy',
        module: 'Career',
      },
      {
        label: 'Applications',
        route: '/career/applications',
        icon: 'bi-kanban',
        module: 'Career',
      },
      {
        label: 'Interview prep',
        route: '/career/questions',
        icon: 'bi-chat-square-quote',
        module: 'Career',
      },
      {
        label: 'Resumes',
        route: '/career/resumes',
        icon: 'bi-file-earmark-person',
        module: 'Career',
      },
      {
        label: 'Reviews',
        route: '/career/reviews',
        icon: 'bi-clipboard-check',
        module: 'Career',
      },
      {
        label: 'Side income',
        route: '/career/side-income',
        icon: 'bi-coin',
        module: 'Career',
      },
      { label: 'Network', route: '/career/network', icon: 'bi-people', module: 'Career' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Accounts', route: '/finance', icon: 'bi-bank', exact: true, module: 'Finance' },
      {
        label: 'Transactions',
        route: '/finance/transactions',
        icon: 'bi-receipt',
        module: 'Finance',
      },
      {
        label: 'Repeating',
        route: '/finance/recurring',
        icon: 'bi-arrow-repeat',
        module: 'Finance',
      },
      { label: 'Budgets', route: '/finance/budgets', icon: 'bi-pie-chart', module: 'Finance' },
      {
        label: 'Net worth',
        route: '/finance/net-worth',
        icon: 'bi-graph-up',
        module: 'Finance',
      },
      {
        label: 'Investments',
        route: '/finance/investments',
        icon: 'bi-graph-up-arrow',
        module: 'Finance',
      },
      { label: 'Loans', route: '/finance/loans', icon: 'bi-bank2', module: 'Finance' },
      {
        label: 'Insurance',
        route: '/finance/insurance',
        icon: 'bi-shield-check',
        module: 'Finance',
      },
      { label: 'Taxes', route: '/finance/taxes', icon: 'bi-file-earmark-text', module: 'Finance' },
      { label: 'Reports', route: '/finance/reports', icon: 'bi-bar-chart', module: 'Finance' },
    ],
  },
  {
    label: 'Wellbeing',
    items: [
      { label: 'Journal', route: '/journal', icon: 'bi-journal-text', module: 'Journal' },
      { label: 'Health', route: '/health', icon: 'bi-heart-pulse', exact: true, module: 'Health' },
      {
        label: 'Medical history',
        route: '/health/history',
        icon: 'bi-clipboard2-pulse',
        module: 'Health',
      },
      { label: 'Doctor visits', route: '/health/visits', icon: 'bi-hospital', module: 'Health' },
      { label: 'Medicines', route: '/health/medications', icon: 'bi-capsule', module: 'Health' },
      { label: 'Exercise', route: '/health/fitness', icon: 'bi-person-walking', module: 'Health' },
      { label: 'Sleep', route: '/health/sleep', icon: 'bi-moon-stars', module: 'Health' },
      { label: 'Body', route: '/health/body', icon: 'bi-rulers', module: 'Health' },
      { label: 'Food & water', route: '/health/nutrition', icon: 'bi-cup-straw', module: 'Health' },
      { label: 'Lab results', route: '/health/labs', icon: 'bi-clipboard2-data', module: 'Health' },
      { label: 'Wellbeing', route: '/health/wellness', icon: 'bi-emoji-smile', module: 'Health' },
    ],
  },
  {
    label: 'Life administration',
    items: [
      { label: 'Documents', route: '/documents', icon: 'bi-folder2-open', module: 'Documents' },
      { label: 'Home', route: '/home', icon: 'bi-house-door', exact: true, module: 'Home' },
      { label: 'Inventory', route: '/home/inventory', icon: 'bi-box-seam', module: 'Home' },
      { label: 'Vehicles', route: '/home/vehicles', icon: 'bi-car-front', module: 'Home' },
      { label: 'Warranties', route: '/home/warranties', icon: 'bi-patch-check', module: 'Home' },
      { label: 'Maintenance', route: '/home/maintenance', icon: 'bi-tools', module: 'Home' },
      { label: 'Bills', route: '/home/bills', icon: 'bi-receipt', module: 'Home' },
      {
        label: 'Household projects',
        route: '/home/projects',
        icon: 'bi-hammer',
        module: 'Home',
      },
    ],
  },
  {
    label: 'Purchases & rewards',
    items: [
      { label: 'Purchases', route: '/purchases', icon: 'bi-bag', exact: true, module: 'Purchases' },
      {
        label: 'Shopping lists',
        route: '/purchases/lists',
        icon: 'bi-cart3',
        module: 'Purchases',
      },
      { label: 'Wishlist', route: '/purchases/wishlist', icon: 'bi-gift', module: 'Purchases' },
      {
        label: 'Rewards & vouchers',
        route: '/purchases/rewards',
        icon: 'bi-ticket-perforated',
        module: 'Purchases',
      },
    ],
  },
  {
    label: 'Your story',
    items: [
      { label: 'Story', route: '/story', icon: 'bi-book', module: 'Story' },
      { label: 'Missions', route: '/missions', icon: 'bi-compass', module: 'Story' },
      { label: 'Life areas', route: '/life-areas', icon: 'bi-bar-chart-steps', module: 'Story' },
      { label: 'Achievements', route: '/achievements', icon: 'bi-award', module: 'Story' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Tags', route: '/tags', icon: 'bi-tags' },
      { label: 'Settings', route: '/settings', icon: 'bi-gear' },
    ],
  },
];
