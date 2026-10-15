import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbDropdownModule, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { Reminder, RemindersService } from '../../core/services/reminders.service';
import { ToastService } from '../../core/services/toast.service';
import { openReminderEditor } from './reminder-editor';
import { SnoozePreset, snoozePresets } from './reminder-times';

/**
 * One reminder with its own actions (done, snooze, restore, edit). Every change goes through RemindersService,
 * which bumps `changedVersion` — the lists holding rows reload from that, so the row needs no outputs for them.
 * Opening the target is left to the host (`openTarget`), which knows how each type is opened.
 */
@Component({
  selector: 'app-reminder-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgbDropdownModule],
  templateUrl: './reminder-row.html',
})
export class ReminderRow {
  private readonly remindersService = inject(RemindersService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);

  readonly reminder = input.required<Reminder>();
  /** Off inside the target's own screen, where "Task: this task" would just point back at itself. */
  readonly showTarget = input(true);
  readonly openTarget = output<Reminder>();

  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  protected readonly isDue = computed(() => {
    const r = this.reminder();
    return !r.dismissedAt && new Date(r.remindAt).getTime() <= Date.now();
  });

  /** Computed when the menu opens, so "in 1 hour" is from now rather than from page load. */
  protected readonly presets = signal<SnoozePreset[]>([]);

  protected refreshPresets(open: boolean): void {
    if (open) {
      this.presets.set(snoozePresets(new Date()));
    }
  }

  protected setDismissed(dismissed: boolean): void {
    this.remindersService.setDismissed(this.reminder().id, dismissed).subscribe({
      next: () => this.toast.success(dismissed ? 'Reminder done.' : 'Reminder restored.'),
      error: (err) => this.toast.error(err.error?.message ?? 'Could not update the reminder.'),
    });
  }

  protected snooze(preset: SnoozePreset): void {
    this.remindersService.snooze(this.reminder().id, preset.until).subscribe({
      next: () => this.toast.success(`Snoozed: ${preset.label.toLowerCase()}.`),
      error: (err) => this.toast.error(err.error?.message ?? 'Could not snooze the reminder.'),
    });
  }

  protected async edit(): Promise<void> {
    const result = await openReminderEditor(this.modal, { reminder: this.reminder() });
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Reminder saved.' : 'Reminder deleted.');
    }
  }
}
