import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { Shell } from './core/layout/shell';
import { MyDay } from './features/dashboard/my-day';
import { ModulePlaceholderData } from './shared/components/module-placeholder/module-placeholder';

const loadPlaceholder = () =>
  import('./shared/components/module-placeholder/module-placeholder').then(
    (m) => m.ModulePlaceholder,
  );

// Each placeholder route is swapped for the real feature route when that module's session lands.
const placeholder = (path: string, title: string, data: ModulePlaceholderData) => ({
  path,
  title: `${title} | LifeOS`,
  loadComponent: loadPlaceholder,
  data,
});

export const routes: Routes = [
  {
    path: 'login',
    title: 'Log in | LifeOS',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Create account | LifeOS',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', title: 'My Day | LifeOS', component: MyDay },
      {
        path: 'inbox',
        title: 'Inbox | LifeOS',
        loadComponent: () => import('./features/inbox/inbox').then((m) => m.Inbox),
      },
      {
        path: 'tags',
        title: 'Tags | LifeOS',
        loadComponent: () => import('./features/tags/tags').then((m) => m.Tags),
      },
      {
        path: 'calendar',
        title: 'Calendar | LifeOS',
        loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
      },
      {
        path: 'goals',
        title: 'Goals | LifeOS',
        loadComponent: () => import('./features/goals/goals').then((m) => m.Goals),
      },
      {
        path: 'goals/new',
        title: 'New goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-form').then((m) => m.GoalForm),
      },
      {
        path: 'goals/:id',
        title: 'Goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-detail').then((m) => m.GoalDetail),
      },
      {
        path: 'goals/:id/edit',
        title: 'Revise goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-form').then((m) => m.GoalForm),
      },
      {
        path: 'tasks',
        title: 'Tasks | LifeOS',
        loadComponent: () => import('./features/tasks/tasks').then((m) => m.Tasks),
      },
      {
        path: 'projects',
        title: 'Projects | LifeOS',
        loadComponent: () => import('./features/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:id',
        title: 'Project | LifeOS',
        loadComponent: () =>
          import('./features/projects/project-detail').then((m) => m.ProjectDetail),
      },
      placeholder('habits', 'Habits', {
        heading: 'Habits',
        icon: 'bi-arrow-repeat',
        summary: 'Small routines, checked off daily.',
        willLetYou: [
          'Check off each day on a simple grid',
          'Keep a streak going, and see honestly when it breaks',
          'Tie a habit to the goal it supports',
        ],
      }),
      placeholder('journal', 'Journal', {
        heading: 'Journal',
        icon: 'bi-journal-text',
        summary: 'A daily entry, a mood, and a weekly look back.',
        willLetYou: [
          'Write or edit one entry per day',
          'Record your mood and see how it trends',
          'Answer a short weekly reflection prompt',
        ],
        captureKind: 'Journal',
      }),
    ],
  },
  { path: '**', redirectTo: '' },
];
