import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbToast } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../../core/services/toast.service';

/** Renders ToastService's queue. Mounted once in App, so it also works on the auth screens outside the shell. */
@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgbToast],
  template: `
    <div class="lifeos-toasts toast-container position-fixed top-0 end-0 p-3" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <ngb-toast
          [class]="'lifeos-toast lifeos-toast-' + toast.kind"
          [autohide]="true"
          [delay]="toast.kind === 'success' ? 4000 : toast.kind === 'error' ? 6000 : 10000"
          (hidden)="toastService.dismiss(toast.id)"
        >
          <div class="d-flex align-items-start gap-2">
            <i
              class="bi"
              [class.bi-check-circle-fill]="toast.kind === 'success'"
              [class.bi-exclamation-triangle-fill]="toast.kind === 'error'"
              [class.bi-bell-fill]="toast.kind === 'reminder'"
            ></i>
            <span class="flex-grow-1">{{ toast.message }}</span>
            <button
              type="button"
              class="btn-close"
              aria-label="Dismiss"
              (click)="toastService.dismiss(toast.id)"
            ></button>
          </div>
        </ngb-toast>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toastService = inject(ToastService);
}
