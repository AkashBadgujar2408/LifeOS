import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CalendarService } from '../../core/services/calendar.service';
import { JournalService } from '../../core/services/journal.service';
import { RemindersService } from '../../core/services/reminders.service';
import { TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { DecisionsService } from '../../core/services/decisions.service';
import { openEventEditor } from '../calendar/event-editor';
import { openDecisionEditor } from '../journal/decision-editor';
import { openTaskEditor } from '../tasks/task-editor';
import { openCourseEditor } from '../learning/course-editor';
import { openCertificationEditor } from '../learning/certification-editor';
import { openNoteEditor } from '../learning/note-editor';
import { LearningService } from '../../core/services/learning.service';
import { apiErrorMessage } from '../../core/services/api-error';

/**
 * Opens any linkable item by its type and id, the way the calendar does: tasks and events in their editor, goals,
 * projects and habits on their page, a journal entry on its day, an inbox item in the Inbox. Used by search and by
 * reminder rows (through ReminderTargetOpener). Kept out of ReminderRow and the editors so they don't import
 * themselves in a cycle.
 */
@Injectable({ providedIn: 'root' })
export class EntityOpener {
  private readonly router = inject(Router);
  private readonly modal = inject(NgbModal);
  private readonly tasksService = inject(TasksService);
  private readonly calendarService = inject(CalendarService);
  private readonly journalService = inject(JournalService);
  private readonly toast = inject(ToastService);
  private readonly remindersService = inject(RemindersService);
  private readonly decisionsService = inject(DecisionsService);
  private readonly learningService = inject(LearningService);

  open(entityType: string, entityId: number): void {
    switch (entityType) {
      case 'Decision':
        this.decisionsService.get(entityId).subscribe({
          next: async (decision) => {
            const result = await openDecisionEditor(this.modal, { decision });
            if (result) {
              this.toast.success(result.kind === 'saved' ? 'Decision saved.' : 'Decision deleted.');
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the decision.')),
        });
        break;
      case 'Goal':
        void this.router.navigate(['/goals', entityId]);
        break;
      case 'Project':
        void this.router.navigate(['/projects', entityId]);
        break;
      case 'Habit':
        void this.router.navigate(['/habits', entityId]);
        break;
      case 'InboxItem':
        void this.router.navigate(['/inbox']);
        break;
      case 'Document':
        void this.router.navigate(['/documents', entityId]);
        break;
      case 'Skill':
        void this.router.navigate(['/learning/skills', entityId]);
        break;
      case 'Book':
        void this.router.navigate(['/learning/books', entityId]);
        break;
      case 'Roadmap':
        void this.router.navigate(['/learning/roadmaps', entityId]);
        break;
      case 'Certification':
        this.learningService.certification(entityId).subscribe({
          next: async (certification) => {
            const result = await openCertificationEditor(this.modal, certification);
            if (result) {
              this.remindersService.notifyChanged();
              this.toast.success(
                result.kind === 'saved' ? 'Certification saved.' : 'Certification deleted.',
              );
            }
          },
          error: (err) =>
            this.toast.error(apiErrorMessage(err, 'Could not open the certification.')),
        });
        break;
      case 'KnowledgeNote':
        this.learningService.knowledgeNote(entityId).subscribe({
          next: async (note) => {
            const result = await openNoteEditor(this.modal, note);
            if (result) {
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Note saved.' : 'Note deleted.');
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the note.')),
        });
        break;
      case 'Course':
        this.learningService.course(entityId).subscribe({
          next: async (course) => {
            const result = await openCourseEditor(this.modal, course);
            if (result) {
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Course saved.' : 'Course deleted.');
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the course.')),
        });
        break;
      case 'JournalEntry':
        // Journal pages are addressed by day; only the entry's id is known here.
        this.journalService.get(entityId).subscribe({
          next: (entry) => void this.router.navigate(['/journal', entry.entryDate]),
          error: (err) =>
            this.toast.error(apiErrorMessage(err, 'Could not open the journal entry.')),
        });
        break;
      case 'Task':
        this.tasksService.get(entityId).subscribe({
          next: async (task) => {
            const result = await openTaskEditor(this.modal, { task });
            if (result) {
              // A new title shows on reminders about it; a deleted task takes its reminders with it.
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the task.')),
        });
        break;
      case 'Event':
        this.calendarService.getEvent(entityId).subscribe({
          next: async (event) => {
            const result = await openEventEditor(this.modal, { event });
            if (result) {
              this.remindersService.notifyChanged();
              this.toast.success(result.kind === 'saved' ? 'Event saved.' : 'Event deleted.');
            }
          },
          error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the event.')),
        });
        break;
    }
  }
}
