import { Injectable, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { InboxKind } from './inbox.service';
import { QuickAddDialog } from '../../shared/components/quick-add/quick-add-dialog';

/** One way to open Quick Add from anywhere: the FAB, the "q" shortcut, the sidebar, empty states. */
@Injectable({ providedIn: 'root' })
export class QuickAddService {
  private readonly modal = inject(NgbModal);

  open(kind?: InboxKind): void {
    if (this.modal.hasOpenModals()) {
      return;
    }

    const modalRef = this.modal.open(QuickAddDialog, { ariaLabelledBy: 'quick-add-heading' });
    if (kind) {
      (modalRef.componentInstance as QuickAddDialog).presetKind(kind);
    }
  }
}
