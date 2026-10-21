import { inject } from '@angular/core';
import { Route } from '@angular/router';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Reports (Session 90): one page with a tab per report, the range shared through `?from=&to=` (a redirect keeps the
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
        redirectTo: () =>
          inject(SettingsService).hiddenModules().has('Goals') ? 'habits' : 'goals',
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
    ],
  },
];
