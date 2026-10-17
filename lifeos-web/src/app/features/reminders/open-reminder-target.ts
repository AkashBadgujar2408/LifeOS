import { Injectable, inject } from '@angular/core';
import { Reminder } from '../../core/services/reminders.service';
import { EntityOpener } from '../search/entity-opener';

/** Opens what a reminder is about (see EntityOpener); a free-standing reminder has nothing to open. */
@Injectable({ providedIn: 'root' })
export class ReminderTargetOpener {
  private readonly entityOpener = inject(EntityOpener);

  open(reminder: Reminder): void {
    if (reminder.entityType && reminder.entityId) {
      this.entityOpener.open(reminder.entityType, reminder.entityId);
    }
  }
}
