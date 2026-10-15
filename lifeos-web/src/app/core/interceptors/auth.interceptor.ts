import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = authService.getToken();

  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      const sessionRejected =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        token !== null &&
        !req.url.startsWith('/api/Shared/Auth/');
      if (!sessionRejected) {
        return throwError(() => err);
      }

      // The stored login has expired (or was revoked): every other call would fail the same way, so log out and
      // send the user to log in again, back to this page afterwards. Only the first of a burst of parallel 401s
      // acts — the rest find the user already logged out.
      if (authService.isAuthenticated()) {
        authService.logout();
        toast.error('Your session has expired. Log in again to carry on.');
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }

      // Complete quietly instead of erroring: the page is being left, and its own "Could not load…" toast would
      // only bury the one message that matters.
      return EMPTY;
    }),
  );
};
