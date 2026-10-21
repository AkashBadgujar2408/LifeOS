import { Injectable, signal } from '@angular/core';

/**
 * Printing a page (Session 90, reports first). While `printing` is true every `<app-data-grid>` drops its paging and
 * lays out every row, so paper gets the whole list, not the page on screen. `print()` sets it, gives the grids a
 * moment to re-render, opens the browser's print dialog and restores them afterwards. Ctrl+P also flips it through
 * `beforeprint`/`afterprint`, but a grid may not have re-rendered in time there — the page's Print button is the
 * reliable way.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  readonly printing = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeprint', () => this.printing.set(true));
      window.addEventListener('afterprint', () => this.printing.set(false));
    }
  }

  async print(): Promise<void> {
    this.printing.set(true);
    // Two frames + a beat: Angular renders, then ag-Grid lays out every row.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))),
    );
    try {
      window.print();
    } finally {
      this.printing.set(false);
    }
  }
}
