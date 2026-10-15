import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Reminder, ReminderStatus, RemindersService } from '../../core/services/reminders.service';
import { ToastService } from '../../core/services/toast.service';
import { ReminderTargetOpener } from './open-reminder-target';
import { openReminderEditor } from './reminder-editor';
import { ReminderRow } from './reminder-row';
import { splitPending } from './reminder-times';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';

/** Reminders: due now (amber), upcoming, and the recently done ones. */
@Component({
  selector: 'app-reminders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, ReminderRow],
  templateUrl: './reminders.html',
})
export class Reminders {
  private readonly remindersService = inject(RemindersService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly targetOpener = inject(ReminderTargetOpener);

  protected readonly view = signal<ReminderStatus>('Pending');
  protected readonly reminders = signal<Reminder[]>([]);
  protected readonly loading = signal(true);
  /** The last load failed: show the retry block, not the empty state (which would say "you have none"). */
  protected readonly loadFailed = signal(false);

  /**
   * Split against the clock each time the list or the due set changes; the shell re-asks for due reminders every
   * minute, so a reminder moves from Upcoming to Due without a reload.
   */
  protected readonly sections = computed(() => {
    this.remindersService.due();
    return splitPending(this.reminders(), new Date());
  });

  constructor() {
    effect(() => {
      // Reload on view switch and after any reminder change, wherever it was made.
      this.remindersService.changedVersion();
      this.load(this.view());
    });
  }

  protected async newReminder(): Promise<void> {
    const result = await openReminderEditor(this.modal, { draft: {} });
    if (result) {
      this.toast.success('Reminder added.');
    }
  }

  protected load(view: ReminderStatus): void {
    this.loading.set(true);
    this.remindersService
      .list(view)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reminders) => {
          this.reminders.set(reminders);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load reminders.'));
        },
      });
  }
}
