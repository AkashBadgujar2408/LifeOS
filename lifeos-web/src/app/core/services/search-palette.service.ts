import { Injectable, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

/**
 * One way to open global search: Ctrl+K / Cmd+K or "/" (the shell listens), the sidebar button, the phone top bar.
 * The palette is loaded on first use — it pulls in the task and event editors, which the shell doesn't need.
 */
@Injectable({ providedIn: 'root' })
export class SearchPaletteService {
  private readonly modal = inject(NgbModal);
  private opening = false;

  async open(): Promise<void> {
    if (this.opening || this.modal.hasOpenModals()) {
      return;
    }

    this.opening = true;
    try {
      const { SearchPalette } = await import('../../features/search/search-palette');
      this.modal.open(SearchPalette, {
        ariaLabelledBy: 'search-palette-label',
        size: 'lg',
        modalDialogClass: 'lifeos-search-dialog',
      });
    } finally {
      this.opening = false;
    }
  }
}
