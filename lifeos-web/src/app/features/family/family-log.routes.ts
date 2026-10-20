import type { Routes } from '@angular/router';

/** Family's log pages (Session 74) — spread into the shell's children in app.routes.ts. */
export const FAMILY_LOG_ROUTES: Routes = [
  {
    path: 'family/interactions',
    title: 'Times in touch | LifeOS',
    loadComponent: () => import('./interactions-page').then((m) => m.FamilyInteractions),
  },
  {
    path: 'family/keep-in-touch',
    title: 'Keep in touch | LifeOS',
    loadComponent: () => import('./keep-in-touch-page').then((m) => m.FamilyKeepInTouch),
  },
  {
    path: 'family/responsibilities',
    title: 'Responsibilities | LifeOS',
    loadComponent: () => import('./responsibilities-page').then((m) => m.FamilyResponsibilities),
  },
];
