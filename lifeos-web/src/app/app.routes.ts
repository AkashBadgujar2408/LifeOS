import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { Shell } from './core/layout/shell';
import { MyDay } from './features/dashboard/my-day';
import { ModulePlaceholderData } from './shared/components/module-placeholder/module-placeholder';

const loadPlaceholder = () =>
  import('./shared/components/module-placeholder/module-placeholder').then(
    (m) => m.ModulePlaceholder,
  );

// Each placeholder route is swapped for the real feature route when that module's session lands. Every Month 1 module
// is built now; exported so later-phase modules can use it again without it being flagged as unused meanwhile.
export const placeholder = (path: string, title: string, data: ModulePlaceholderData) => ({
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
    path: 'reset-password',
    title: 'Reset password | LifeOS',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
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
        path: 'settings',
        title: 'Settings | LifeOS',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
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
        path: 'reminders',
        title: 'Reminders | LifeOS',
        loadComponent: () => import('./features/reminders/reminders').then((m) => m.Reminders),
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
      {
        path: 'habits',
        title: 'Habits | LifeOS',
        loadComponent: () => import('./features/habits/habits').then((m) => m.Habits),
      },
      {
        path: 'documents',
        title: 'Documents | LifeOS',
        loadComponent: () => import('./features/documents/documents').then((m) => m.Documents),
      },
      {
        path: 'documents/:id',
        title: 'Document | LifeOS',
        loadComponent: () =>
          import('./features/documents/document-detail').then((m) => m.DocumentDetail),
      },
      {
        path: 'habits/:id',
        title: 'Habit | LifeOS',
        loadComponent: () => import('./features/habits/habit-detail').then((m) => m.HabitDetail),
      },
      {
        path: 'journal',
        title: 'Journal | LifeOS',
        loadComponent: () => import('./features/journal/journal').then((m) => m.Journal),
      },
      // Before 'journal/:date', so "week", "month" and "decisions" aren't read as dates.
      {
        path: 'journal/decisions',
        title: 'Decisions | LifeOS',
        loadComponent: () => import('./features/journal/decisions').then((m) => m.Decisions),
      },
      {
        path: 'journal/month',
        title: 'Monthly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/monthly-reflection').then((m) => m.MonthlyReflection),
      },
      {
        path: 'journal/month/:month',
        title: 'Monthly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/monthly-reflection').then((m) => m.MonthlyReflection),
      },
      {
        path: 'journal/week',
        title: 'Weekly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/weekly-reflection').then((m) => m.WeeklyReflection),
      },
      {
        path: 'journal/week/:weekStart',
        title: 'Weekly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/weekly-reflection').then((m) => m.WeeklyReflection),
      },
      {
        path: 'journal/:date',
        title: 'Journal | LifeOS',
        loadComponent: () => import('./features/journal/journal').then((m) => m.Journal),
      },
      {
        path: 'story',
        title: 'Your story | LifeOS',
        loadComponent: () => import('./features/story/story').then((m) => m.Story),
      },
      {
        path: 'missions',
        title: 'Missions | LifeOS',
        loadComponent: () => import('./features/story/missions').then((m) => m.Missions),
      },
      {
        path: 'life-areas',
        title: 'Life areas | LifeOS',
        loadComponent: () => import('./features/story/life-areas').then((m) => m.LifeAreas),
      },
      {
        path: 'achievements',
        title: 'Achievements | LifeOS',
        loadComponent: () => import('./features/story/achievements').then((m) => m.Achievements),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
