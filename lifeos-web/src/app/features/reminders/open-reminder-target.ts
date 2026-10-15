import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CalendarService } from '../../core/services/calendar.service';
import { JournalService } from '../../core/services/journal.service';
import { Reminder, RemindersService } from '../../core/services/reminders.service';
import { TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { openEventEditor } from '../calendar/event-editor';
import { openTaskEditor } from '../tasks/task-editor';

/**
 * Opens what a reminder is about, the same way the calendar does: tasks and events in their editor, goals,
 * projects, habits and journal entries on their page. Kept out of ReminderRow so the editors (which embed reminder
 * rows) don't import themselves in a cycle.
 */
@Injectable({ providedIn: 'root' })
export class ReminderTargetOpener {
  private readonly router = inject(Router);
  private readonly modal = inject(NgbModal);
  private readonly tasksService = inject(TasksService);
  private readonly calendarService = inject(CalendarService);
  private readonly journalService = inject(JournalService);
  private readonly toast = inject(ToastService);
  private readonly remindersService = inject(RemindersService);

  open(reminder: Reminder): void {
    switch (reminder.entityType) {
      case 'Goal':
        void this.router.navigate(['/goals', reminder.entityId]);
        break;
      case 'Project':
        void this.router.navigate(['/projects', reminder.entityId]);
        break;
      case 'Habit':
        void this.router.navigate(['/habits', reminder.entityId]);
        break;
      case 'JournalEntry':
        // Journal pages are addressed by day; the reminder only knows the entry's id.
        this.journalService.get(reminder.entityId!).subscribe({
          next: (entry) => void this.router.navigate(['/journal', entry.entryDate]),
          error: () => this.toast.error('Could not open the journal entry.'),
        });
        break;
      case 'Task':
        this.tasksService.get(reminder.entityId!).subscribe({
          next: async (task) => {
            const result = await openTaskEditor(this.modal, { task });
            if (result) {
              // A new title shows on the reminder; a deleted target takes its reminders with it.
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
            }
          },
          error: () => this.toast.error('Could not open the task.'),
        });
        break;
      case 'Event':
        this.calendarService.getEvent(reminder.entityId!).subscribe({
          next: async (event) => {
            const result = await openEventEditor(this.modal, { event });
            if (result) {
              // A new title shows on the reminder; a deleted target takes its reminders with it.
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Event saved.' : 'Event deleted.');
            }
          },
          error: () => this.toast.error('Could not open the event.'),
        });
        break;
    }
  }
}
