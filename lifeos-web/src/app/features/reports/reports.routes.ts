import { inject } from '@angular/core';
import { Route } from '@angular/router';
import { SettingsService } from '../../core/services/settings.service';
import { REPORT_TABS } from './report-view';

/**
 * Reports (Sessions 90–91): one page with a tab per report, the range shared through `?from=&to=` (a redirect keeps the
 * query). `/reports` opens the first report whose module is switched on.
 */
export const REPORTS_ROUTES: Route[] = [
  // The Annual Life Review is a page of its own (one year, not the shared range), so it comes before 'reports'.
  {
    path: 'reports/year',
    pathMatch: 'full',
    redirectTo: () => `reports/year/${new Date().getFullYear()}`,
  },
  {
    path: 'reports/year/:year',
    title: 'Year in review | LifeOS',
    loadComponent: () => import('./annual-review').then((m) => m.AnnualReviewPage),
  },
  {
    path: 'reports',
    loadComponent: () => import('./reports').then((m) => m.Reports),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => {
          const hidden = inject(SettingsService).hiddenModules();
          return (
            REPORT_TABS.find((tab) => !tab.module || !hidden.has(tab.module))?.path ?? 'balance'
          );
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
        path: 'money',
        title: 'Money report | LifeOS',
        loadComponent: () => import('./money-report').then((m) => m.MoneyReport),
      },
      {
        path: 'balance',
        title: 'Life balance report | LifeOS',
        loadComponent: () => import('./balance-report').then((m) => m.BalanceReport),
      },
      {
        path: 'custom',
        title: 'Custom report | LifeOS',
        loadComponent: () => import('./custom-report').then((m) => m.CustomReport),
      },
      {
        path: 'health',
        title: 'Health report | LifeOS',
        loadComponent: () => import('./health-report').then((m) => m.HealthReport),
      },
    ],
  },
];
