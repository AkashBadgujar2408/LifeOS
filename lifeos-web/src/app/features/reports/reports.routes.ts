import { inject } from '@angular/core';
import { Route } from '@angular/router';
import { SettingsService } from '../../core/services/settings.service';
import { REPORT_TABS } from './report-view';

/**
 * Reports (Sessions 90–91): one page with a tab per report, the range shared through `?from=&to=` (a redirect keeps the
 * query). `/reports` opens the first report whose module is switched on.
 */
export const REPORTS_ROUTES: Route[] = [
  {
    path: 'reports',
    loadComponent: () => import('./reports').then((m) => m.Reports),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => {
          const hidden = inject(SettingsService).hiddenModules();
          return REPORT_TABS.find((tab) => !hidden.has(tab.module))?.path ?? 'goals';
        },
      },
      {
        path: 'goals',
        title: 'Goal report | LifeOS',
        loadComponent: () => import('./goal-report').then((m) => m.GoalReport),
      },
      {
        path: 'habits',
        title: 'Habit report | LifeOS',
        loadComponent: () => import('./habit-report').then((m) => m.HabitReport),
      },
      {
        path: 'productivity',
        title: 'Productivity report | LifeOS',
        loadComponent: () => import('./productivity-report').then((m) => m.ProductivityReport),
      },
      {
        path: 'learning',
        title: 'Learning report | LifeOS',
        loadComponent: () => import('./learning-report').then((m) => m.LearningReport),
      },
      {
        path: 'health',
        title: 'Health report | LifeOS',
        loadComponent: () => import('./health-report').then((m) => m.HealthReport),
      },
    ],
  },
];
