import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { RemindersService } from '../../core/services/reminders.service';

/**
 * Opens what the assistant saved: reminders on the Reminders page, everything else through EntityOpener — loaded
 * with import() so its editors stay out of the chat panel's chunk.
 */
export async function openSavedItem(
  injector: Injector,
  entityType: string,
  entityId: number,
): Promise<void> {
  if (entityType === 'Reminder') {
    await injector.get(Router).navigate(['/reminders']);
    return;
  }
  const { EntityOpener } = await import('../search/entity-opener');
  injector.get(EntityOpener).open(entityType, entityId);
}

/** After a save: lists that follow a change signal reload (reminders do; other pages re-read when opened). */
export function notifySaved(injector: Injector, entityType: string): void {
  if (entityType === 'Reminder') {
    injector.get(RemindersService).notifyChanged();
  }
}
