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
    ],
  },
  {
    label: 'Wellbeing',
    items: [{ label: 'Journal', route: '/journal', icon: 'bi-journal-text', module: 'Journal' }],
  },
  {
    label: 'Life administration',
    items: [
      { label: 'Documents', route: '/documents', icon: 'bi-folder2-open', module: 'Documents' },
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
