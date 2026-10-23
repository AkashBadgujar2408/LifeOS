import { Injectable, inject } from '@angular/core';
import { NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';

/**
 * One way to open the AI assistant's chat: the sidebar button and the phone top bar. The panel is loaded on first
 * use, so the chat stays out of the shell bundle.
 */
@Injectable({ providedIn: 'root' })
export class AssistantPanelService {
  private readonly offcanvas = inject(NgbOffcanvas);
  private opening = false;

  async open(): Promise<void> {
    if (this.opening || this.offcanvas.hasOpenOffcanvas()) {
      return;
    }

    this.opening = true;
    try {
      const { AssistantPanel } = await import('../../features/assistant/assistant-panel');
      this.offcanvas.open(AssistantPanel, {
        position: 'end',
        panelClass: 'lifeos-assistant',
        ariaLabelledBy: 'assistant-title',
      });
    } finally {
      this.opening = false;
    }
  }
}
