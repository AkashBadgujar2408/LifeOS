import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * What a page shows instead of its content when the first load failed — never the empty state, which would claim
 * "you have nothing" when the truth is "we couldn't ask". The toast says why; this offers the way out.
 */
@Component({
  selector: 'app-load-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0"
      role="alert"
    >
      <span><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>{{ message() }}</span>
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="retry.emit()">
        Try again
      </button>
    </div>
  `,
})
export class LoadError {
  readonly message = input("Couldn't load this page.");
  readonly retry = output();
}
