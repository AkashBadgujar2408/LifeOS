import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { INBOX_KINDS, InboxKind, InboxService } from '../../core/services/inbox.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { RemindersService } from '../../core/services/reminders.service';
import { ReminderTargetOpener } from '../reminders/open-reminder-target';
import { ReminderRow } from '../reminders/reminder-row';

const KIND_LABELS: Record<InboxKind, [singular: string, plural: string]> = {
  Task: ['Task', 'Tasks'],
  Note: ['Note', 'Notes'],
  Journal: ['Journal entry', 'Journal entries'],
  Idea: ['Idea', 'Ideas'],
};

/**
 * Landing screen. Deliberately small until the Dashboard milestone (Sessions 22–23) aggregates tasks, events,
 * habits and journal here; for now it shows the date and what's waiting in the Inbox.
 */
@Component({
  selector: 'app-my-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, ReminderRow],
  templateUrl: './my-day.html',
  styleUrl: './my-day.scss',
})
export class MyDay {
  private readonly authService = inject(AuthService);
  protected readonly inboxService = inject(InboxService);
  protected readonly quickAdd = inject(QuickAddService);
  protected readonly remindersService = inject(RemindersService);
  protected readonly targetOpener = inject(ReminderTargetOpener);

  protected readonly kinds = INBOX_KINDS;
  protected readonly today = new Date();

  protected readonly greeting = computed(() => {
    const hour = this.today.getHours();
    const partOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = this.authService.currentUser()?.displayName.split(' ')[0];
    return firstName ? `${partOfDay}, ${firstName}.` : `${partOfDay}.`;
  });

  protected readonly waitingKinds = computed(() =>
    this.kinds
      .map((kind) => {
        const count = this.inboxService.openCounts()[kind];
        return { kind, count, label: count === 1 ? KIND_LABELS[kind][0] : KIND_LABELS[kind][1] };
      })
      .filter((entry) => entry.count > 0),
  );
}
