import { inject } from '@angular/core';
import { Route, Router } from '@angular/router';

/**
 * Leisure & media (Session 78b). Static paths come before `leisure/:id`. Learning's old reading list redirects here:
 * `/learning/books` → the backlog's books, `/learning/books/:id` → the item (books kept no ids across the move —
 * their data wasn't kept — so an old link to a book lands on "couldn't load", never on another item's page).
 */
export const LEISURE_ROUTES: Route[] = [
  {
    path: 'learning/books',
    pathMatch: 'full',
    redirectTo: () => inject(Router).createUrlTree(['/leisure'], { queryParams: { kind: 'Book' } }),
  },
  { path: 'learning/books/:id', redirectTo: 'leisure/:id' },
  {
    path: 'leisure',
    title: 'Leisure & media | LifeOS',
    loadComponent: () => import('./leisure').then((m) => m.Leisure),
  },
  {
    path: 'leisure/hobbies',
    title: 'Hobbies | LifeOS',
    loadComponent: () => import('./hobbies').then((m) => m.Hobbies),
  },
  {
    path: 'leisure/hobbies/:id',
    title: 'Hobby | LifeOS',
    loadComponent: () => import('./hobby-detail').then((m) => m.HobbyDetail),
  },
  {
    path: 'leisure/year',
    title: 'Year in media | LifeOS',
    loadComponent: () => import('./year-in-media').then((m) => m.YearInMedia),
  },
  {
    path: 'leisure/year/:year',
    title: 'Year in media | LifeOS',
    loadComponent: () => import('./year-in-media').then((m) => m.YearInMedia),
  },
  {
    path: 'leisure/:id',
    title: 'Media | LifeOS',
    loadComponent: () => import('./media-detail').then((m) => m.MediaDetail),
  },
];
