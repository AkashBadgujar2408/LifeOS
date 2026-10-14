import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QuickAddService } from '../../../core/services/quick-add.service';

/**
 * Global capture entry point: a floating button plus the "q" keyboard shortcut (ignored while typing in a
 * field). Mounted once in the shell, so it's available on every authenticated screen.
 */
@Component({
  selector: 'app-quick-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <button
      type="button"
      class="btn btn-primary rounded-circle position-fixed bottom-0 end-0 m-4 shadow d-flex align-items-center justify-content-center"
      style="width: 3.5rem; height: 3.5rem; z-index: 1030"
      title="Quick add (Q)"
      aria-label="Quick add"
      (click)="quickAdd.open()"
    >
      <i class="bi bi-plus-lg fs-4"></i>
    </button>
  `,
})
export class QuickAdd {
  protected readonly quickAdd = inject(QuickAddService);

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'q' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;
    if (isTyping) {
      return;
    }

    event.preventDefault();
    this.quickAdd.open();
  }
}
