import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'reminder';

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

  /** A reminder that has come due; stays up longer than a confirmation. */
  reminder(message: string): void {
    this.show('reminder', message);
  }

  dismiss(id: number): void {
    this.toastsSignal.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string): void {
    this.toastsSignal.update((toasts) =>
      // The same message already showing (several requests failing for one reason, e.g. the server being down)
      // says nothing new; and keep the stack short so a burst of failures can't bury the screen.
      toasts.some((t) => t.kind === kind && t.message === message)
        ? toasts
        : [...toasts, { id: this.nextId++, kind, message }].slice(-4),
    );
  }
}
