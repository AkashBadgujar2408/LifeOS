import { ChangeDetectionStrategy, Component, OnInit, input, model } from '@angular/core';

export type GridView = 'cards' | 'table';

/**
 * "Cards | Table" for a page that keeps its own card layout (a board, rooms) and also offers its items as one data
 * grid to sort, page and export (Session 75a). The choice is remembered per page on this device.
 */
@Component({
  selector: 'app-view-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="btn-group btn-group-sm" role="group" [attr.aria-label]="label()">
      <button
        type="button"
        class="btn btn-outline-secondary"
        [class.active]="view() === 'cards'"
        [attr.aria-pressed]="view() === 'cards'"
        (click)="set('cards')"
      >
        <i class="bi {{ cardsIcon() }}" aria-hidden="true"></i> {{ cardsLabel() }}
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary"
        [class.active]="view() === 'table'"
        [attr.aria-pressed]="view() === 'table'"
        (click)="set('table')"
      >
        <i class="bi bi-table" aria-hidden="true"></i> Table
      </button>
    </div>
  `,
})
export class ViewToggle implements OnInit {
  /** Names the remembered choice ("lifeos.view.<key>"). */
  readonly key = input.required<string>();
  readonly label = input('Show as');
  readonly cardsLabel = input('Cards');
  readonly cardsIcon = input('bi-grid');
  readonly view = model<GridView>('cards');

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem(`lifeos.view.${this.key()}`);
      if (stored === 'cards' || stored === 'table') {
        this.view.set(stored);
      }
    } catch {
      // A convenience only — the page's default stands.
    }
  }

  protected set(view: GridView): void {
    this.view.set(view);
    try {
      localStorage.setItem(`lifeos.view.${this.key()}`, view);
    } catch {
      // A convenience only.
    }
  }
}
