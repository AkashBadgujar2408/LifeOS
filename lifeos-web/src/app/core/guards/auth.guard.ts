import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Remember where they were going, so logging in lands there instead of on My Day.
  return router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
  });
};

/** Only an in-app path may be a return URL: "/goals/3" yes; "//evil.example" or "https://..." no. */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login')
    ? value
    : '/';
}
