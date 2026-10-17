import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { TaskItem } from '../../core/services/tasks.service';
import { formatMinutes } from '../calendar/calendar-feed';
import { timeVersusEstimate } from './focus';
import { recurrenceLabel, waitingOn } from './task-views';

const PRIORITY_META: Record<string, { icon: string; tone: string } | undefined> = {
  High: { icon: 'bi-flag-fill', tone: 'text-danger' },
  Medium: { icon: 'bi-flag-fill', tone: 'text-warning' },
  Low: { icon: 'bi-flag', tone: 'text-body-secondary' },
};

/**
 * One task in a list: tick box, title, and its date/repeat/priority/project/tags line. Clicking the title asks the
 * parent to open the editor. Place it inside a `.list-group` container.
 */
@Component({
  selector: 'app-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  host: { class: 'list-group-item py-2', role: 'listitem' },
  templateUrl: './task-row.html',
})
export class TaskRow {
  readonly task = input.required<TaskItem>();
  /** The user's local date, "yyyy-MM-dd", for the overdue colouring. */
  readonly today = input.required<string>();
  readonly showDate = input(false);
  /** Off inside a project's own page, where it would just repeat the heading. */
  readonly showProject = input(true);
  /** Disables the tick box while a toggle is in flight. */
  readonly busy = input(false);

  readonly toggled = output<TaskItem>();
  readonly opened = output<TaskItem>();

  protected readonly priorityMeta = PRIORITY_META;
  protected readonly recurrenceLabel = recurrenceLabel;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  /** Open tasks it still waits for: "Choose a painter" or "2 tasks". */
  protected readonly waitingOn = computed(() =>
    this.task().status === 'Open' ? waitingOn(this.task()) : null,
  );
  protected readonly timeText = computed(() =>
    timeVersusEstimate(this.task().actualMinutes, this.task().estimateMinutes, formatMinutes),
  );

  protected readonly overdue = computed(() => {
    const task = this.task();
    return task.status === 'Open' && task.dueDate !== null && task.dueDate < this.today();
  });
}
