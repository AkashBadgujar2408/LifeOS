import { addDaysIso } from '../../core/dates/today';
import { TaskItem, TaskPriority, TaskRecurrence } from '../../core/services/tasks.service';

export type TaskView = 'today' | 'upcoming' | 'someday' | 'done';

export interface TaskBuckets {
  /** Due before today. Shown at the top of Today. */
  overdue: TaskItem[];
  today: TaskItem[];
  upcoming: TaskItem[];
  someday: TaskItem[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2, None: 3 };

const byPriority = (a: TaskItem, b: TaskItem) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
// Someday (no date) sorts after every dated task.
const byDueDate = (a: TaskItem, b: TaskItem) =>
  (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
const byCreated = (a: TaskItem, b: TaskItem) => a.createdAt.localeCompare(b.createdAt);

export type TaskSort = 'dueDate' | 'priority' | 'recent';

export const TASK_SORTS: TaskSort[] = ['dueDate', 'priority', 'recent'];

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  dueDate: 'Due date',
  priority: 'Priority',
  recent: 'Recently added',
};

const COMPARERS: Record<TaskSort, (a: TaskItem, b: TaskItem) => number> = {
  dueDate: (a, b) => byDueDate(a, b) || byPriority(a, b) || byCreated(a, b),
  priority: (a, b) => byPriority(a, b) || byDueDate(a, b) || byCreated(a, b),
  recent: (a, b) => byCreated(b, a),
};

/** A sorted copy. Ties always fall back to something stable, so the order never jumps around between loads. */
export function sortTasks(tasks: TaskItem[], sort: TaskSort): TaskItem[] {
  return [...tasks].sort(COMPARERS[sort]);
}

/**
 * Splits open tasks into the views by the user's *local* date (`today`, "yyyy-MM-dd"), which is why this happens
 * client-side rather than in the API. Dates compare as strings because they're all zero-padded ISO dates.
 * Each bucket is ordered by `sort`; Upcoming is still shown grouped by day (see groupByDueDate).
 */
export function bucketTasks(
  tasks: TaskItem[],
  today: string,
  sort: TaskSort = 'dueDate',
): TaskBuckets {
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

  for (const bucket of Object.values(buckets)) {
    bucket.sort(COMPARERS[sort]);
  }
  return buckets;
}

export interface DateGroup {
  date: string;
  tasks: TaskItem[];
}

/** Dated tasks grouped under one heading per due date, days in order; tasks keep their order within a day. */
export function groupByDueDate(tasks: TaskItem[]): DateGroup[] {
  const groups = new Map<string, TaskItem[]>();
  for (const task of tasks) {
    const date = task.dueDate!;
    groups.set(date, [...(groups.get(date) ?? []), task]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, grouped]) => ({ date, tasks: grouped }));
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
