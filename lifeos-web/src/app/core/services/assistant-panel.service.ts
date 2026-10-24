import { Injectable, inject } from '@angular/core';
import { NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';

/**
 * One way to open the AI assistant's chat: the sidebar button, the phone top bar and Quick Add's "Ask the
 * assistant" (which passes its line as the first question). The panel is loaded on first use, so the chat stays out
 * of the shell bundle.
 */
@Injectable({ providedIn: 'root' })
export class AssistantPanelService {
  private readonly offcanvas = inject(NgbOffcanvas);
  private opening = false;

  async open(question?: string): Promise<void> {
    if (this.opening || this.offcanvas.hasOpenOffcanvas()) {
      return;
    }

    this.opening = true;
    try {
      const { AssistantPanel } = await import('../../features/assistant/assistant-panel');
      const ref = this.offcanvas.open(AssistantPanel, {
        position: 'end',
        panelClass: 'lifeos-assistant',
        ariaLabelledBy: 'assistant-title',
      });
      if (question) {
        (ref.componentInstance as InstanceType<typeof AssistantPanel>).ask(question);
      }
    } finally {
      this.opening = false;
    }
  }
}
