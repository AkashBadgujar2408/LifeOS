import { addDaysIso } from '../../core/dates/today';
import { TaskItem, TaskPriority, TaskRecurrence } from '../../core/services/tasks.service';

export type TaskView = 'today' | 'upcoming' | 'someday' | 'done';

export interface TaskBuckets {
  /** Due before today, oldest first. Shown at the top of Today. */
  overdue: TaskItem[];
  today: TaskItem[];
  upcoming: TaskItem[];
  someday: TaskItem[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2, None: 3 };

const byPriority = (a: TaskItem, b: TaskItem) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
const byDueDate = (a: TaskItem, b: TaskItem) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
const byCreated = (a: TaskItem, b: TaskItem) => a.createdAt.localeCompare(b.createdAt);

/**
 * Splits open tasks into the views by the user's *local* date (`today`, "yyyy-MM-dd"), which is why this happens
 * client-side rather than in the API. Dates compare as strings because they're all zero-padded ISO dates.
 */
export function bucketTasks(tasks: TaskItem[], today: string): TaskBuckets {
  const buckets: TaskBuckets = { overdue: [], today: [], upcoming: [], someday: [] };
  for (const task of tasks) {
    if (task.dueDate === null) {
      buckets.someday.push(task);
    } else if (task.dueDate < today) {
      buckets.overdue.push(task);
    } else if (task.dueDate === today) {
      buckets.today.push(task);
    } else {
      buckets.upcoming.push(task);
    }
  }

  buckets.overdue.sort((a, b) => byDueDate(a, b) || byPriority(a, b) || byCreated(a, b));
  buckets.today.sort((a, b) => byPriority(a, b) || byCreated(a, b));
  buckets.upcoming.sort((a, b) => byDueDate(a, b) || byPriority(a, b) || byCreated(a, b));
  buckets.someday.sort((a, b) => byPriority(a, b) || byCreated(a, b));
  return buckets;
}

export interface DateGroup {
  date: string;
  tasks: TaskItem[];
}

/** Upcoming tasks grouped under one heading per due date (input already sorted by date). */
export function groupByDueDate(tasks: TaskItem[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const task of tasks) {
    const last = groups.at(-1);
    if (last && last.date === task.dueDate) {
      last.tasks.push(task);
    } else {
      groups.push({ date: task.dueDate!, tasks: [task] });
    }
  }
  return groups;
}

/** "Tomorrow" for the day after `today`, otherwise null (the caller shows the formatted date). */
export function relativeDayLabel(date: string, today: string): string | null {
  return date === addDaysIso(today, 1) ? 'Tomorrow' : null;
}

const UNITS: Record<TaskRecurrence['frequency'], [string, string]> = {
  Daily: ['day', 'days'],
  Weekly: ['week', 'weeks'],
  Monthly: ['month', 'months'],
  Yearly: ['year', 'years'],
};

/** "Every week", "Every 2 weeks". */
export function recurrenceLabel(recurrence: TaskRecurrence): string {
  const [one, many] = UNITS[recurrence.frequency];
  return recurrence.interval === 1 ? `Every ${one}` : `Every ${recurrence.interval} ${many}`;
}

/** Due date a new task gets when quick-added from a view: you're adding it *to* that view. */
export function defaultDueDateFor(view: TaskView, today: string): string | null {
  switch (view) {
    case 'today':
      return today;
    case 'upcoming':
      return addDaysIso(today, 1);
    default:
      return null;
  }
}
