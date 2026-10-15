import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  Reminder,
  ReminderTargetType,
  RemindersService,
} from '../../../core/services/reminders.service';
import { ToastService } from '../../../core/services/toast.service';
import { openReminderEditor } from '../../../features/reminders/reminder-editor';
import { ReminderRow } from '../../../features/reminders/reminder-row';

/**
 * The pending reminders about one entity, plus "Remind me". Drop it on a detail screen or editor:
 * <app-entity-reminders entityType="Task" [entityId]="task.id" [entityTitle]="task.title" />.
 */
@Component({
  selector: 'app-entity-reminders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReminderRow],
  template: `
    <div>
      <div class="d-flex align-items-center justify-content-between mb-2">
        <span class="small fw-semibold text-body-secondary">
          <i class="bi bi-bell"></i> Reminders
        </span>
        <button type="button" class="btn btn-link btn-sm p-0" (click)="add()">+ Remind me</button>
      </div>
      @if (loading()) {
        <div class="small text-body-secondary">Loading reminders...</div>
      } @else if (reminders().length === 0) {
        <div class="small text-body-secondary">No reminders set.</div>
      } @else {
        <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
          @for (reminder of reminders(); track reminder.id) {
            <li><app-reminder-row [reminder]="reminder" [showTarget]="false" /></li>
          }
        </ul>
      }
    </div>
  `,
})
export class EntityReminders {
  private readonly remindersService = inject(RemindersService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);

  readonly entityType = input.required<ReminderTargetType>();
  readonly entityId = input.required<number>();
  /** Starting title for a new reminder. */
  readonly entityTitle = input.required<string>();

  protected readonly reminders = signal<Reminder[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    effect(() => {
      this.remindersService.changedVersion();
      this.load(this.entityType(), this.entityId());
    });
  }

  protected async add(): Promise<void> {
    const result = await openReminderEditor(this.modal, {
      draft: {
        title: this.entityTitle(),
        target: {
          entityType: this.entityType(),
          entityId: this.entityId(),
          title: this.entityTitle(),
        },
      },
    });
    if (result) {
      this.toast.success('Reminder added.');
    }
  }

  private load(entityType: ReminderTargetType, entityId: number): void {
    this.remindersService
      .list('Pending', { entityType, entityId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reminders) => {
          this.reminders.set(reminders);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load reminders.');
        },
      });
  }
}
