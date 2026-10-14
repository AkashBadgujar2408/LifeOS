import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/**
 * App-wide notifications, rendered by the one <app-toasts /> mounted in App (ng-bootstrap's NgbToast).
 * Same call shape the app used with ngx-toastr: toast.success('Saved.'), toast.error('Could not save.').
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    this.show('error', message);
  }

  dismiss(id: number): void {
    this.toastsSignal.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string): void {
    // Keep the stack short: a burst of failures shouldn't bury the screen.
    this.toastsSignal.update((toasts) =>
      [...toasts, { id: this.nextId++, kind, message }].slice(-4),
    );
  }
}
