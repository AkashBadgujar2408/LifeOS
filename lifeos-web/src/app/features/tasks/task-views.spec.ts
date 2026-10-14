import { addDaysIso } from '../../core/dates/today';
import { TaskItem } from '../../core/services/tasks.service';
import {
  bucketTasks,
  defaultDueDateFor,
  groupByDueDate,
  recurrenceLabel,
  relativeDayLabel,
  sortTasks,
} from './task-views';

let nextId = 1;
const task = (overrides: Partial<TaskItem>): TaskItem => ({
  id: nextId++,
  title: 'Task',
  notes: null,
  dueDate: null,
  priority: 'None',
  status: 'Open',
  completedAt: null,
  projectId: null,
  projectName: null,
  recurrence: null,
  tags: [],
  createdAt: '2026-10-01T10:00:00Z',
  ...overrides,
});

const TODAY = '2026-10-14';

describe('bucketTasks', () => {
  it('splits open tasks into overdue / today / upcoming / someday by local date', () => {
    const late = task({ title: 'late', dueDate: '2026-10-10' });
    const now = task({ title: 'now', dueDate: TODAY });
    const soon = task({ title: 'soon', dueDate: '2026-10-15' });
    const whenever = task({ title: 'whenever' });

    const buckets = bucketTasks([soon, whenever, now, late], TODAY);

    expect(buckets.overdue).toEqual([late]);
    expect(buckets.today).toEqual([now]);
    expect(buckets.upcoming).toEqual([soon]);
    expect(buckets.someday).toEqual([whenever]);
  });

  it('orders by date, then priority (High first), then creation', () => {
    const low = task({ dueDate: TODAY, priority: 'Low' });
    const high = task({ dueDate: TODAY, priority: 'High' });
    const noneOld = task({ dueDate: TODAY, createdAt: '2026-10-01T00:00:00Z' });
    const noneNew = task({ dueDate: TODAY, createdAt: '2026-10-02T00:00:00Z' });
    const later = task({ dueDate: '2026-10-20', priority: 'High' });
    const sooner = task({ dueDate: '2026-10-16', priority: 'Low' });

    const buckets = bucketTasks([noneNew, low, later, high, noneOld, sooner], TODAY);

    expect(buckets.today).toEqual([high, low, noneOld, noneNew]);
    expect(buckets.upcoming).toEqual([sooner, later]);
  });
});

describe('sortTasks', () => {
  const urgentLater = task({
    dueDate: '2026-10-20',
    priority: 'High',
    createdAt: '2026-10-03T00:00:00Z',
  });
  const plainSooner = task({
    dueDate: '2026-10-16',
    priority: 'None',
    createdAt: '2026-10-05T00:00:00Z',
  });
  const someday = task({ dueDate: null, priority: 'Medium', createdAt: '2026-10-04T00:00:00Z' });
  const tasks = [someday, urgentLater, plainSooner];

  it('by due date puts the soonest first and undated tasks last', () => {
    expect(sortTasks(tasks, 'dueDate')).toEqual([plainSooner, urgentLater, someday]);
  });

  it('by priority puts High first, breaking ties by due date', () => {
    const highSooner = task({ dueDate: '2026-10-15', priority: 'High' });
    expect(sortTasks([...tasks, highSooner], 'priority')).toEqual([
      highSooner,
      urgentLater,
      someday,
      plainSooner,
    ]);
  });

  it('by recently added puts the newest first', () => {
    expect(sortTasks(tasks, 'recent')).toEqual([plainSooner, someday, urgentLater]);
  });

  it('returns a copy, leaving the input alone', () => {
    sortTasks(tasks, 'dueDate');
    expect(tasks).toEqual([someday, urgentLater, plainSooner]);
  });

  it('applies to each bucket', () => {
    const low = task({ dueDate: '2026-10-16', priority: 'Low' });
    const high = task({ dueDate: '2026-10-19', priority: 'High' });

    expect(bucketTasks([low, high], TODAY, 'priority').upcoming).toEqual([high, low]);
    expect(bucketTasks([low, high], TODAY, 'dueDate').upcoming).toEqual([low, high]);
  });
});

describe('groupByDueDate', () => {
  it('puts tasks on the same day under one heading, keeping order', () => {
    const a = task({ dueDate: '2026-10-15' });
    const b = task({ dueDate: '2026-10-15' });
    const c = task({ dueDate: '2026-10-18' });

    expect(groupByDueDate([a, b, c])).toEqual([
      { date: '2026-10-15', tasks: [a, b] },
      { date: '2026-10-18', tasks: [c] },
    ]);
  });

  it('orders the days even when the tasks are sorted some other way', () => {
    const later = task({ dueDate: '2026-10-18', priority: 'High' });
    const soon = task({ dueDate: '2026-10-15', priority: 'Low' });
    const soonToo = task({ dueDate: '2026-10-15', priority: 'High' });

    expect(groupByDueDate([later, soonToo, soon])).toEqual([
      { date: '2026-10-15', tasks: [soonToo, soon] },
      { date: '2026-10-18', tasks: [later] },
    ]);
  });
});

describe('date helpers', () => {
  it('labels only the next day as Tomorrow', () => {
    expect(relativeDayLabel('2026-10-15', TODAY)).toBe('Tomorrow');
    expect(relativeDayLabel('2026-10-16', TODAY)).toBeNull();
  });

  it('moves calendar dates across month and year ends', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('gives a quick-added task the date of the view it was added to', () => {
    expect(defaultDueDateFor('today', TODAY)).toBe(TODAY);
    expect(defaultDueDateFor('upcoming', TODAY)).toBe('2026-10-15');
    expect(defaultDueDateFor('someday', TODAY)).toBeNull();
  });
});

describe('recurrenceLabel', () => {
  it('reads naturally for one and many', () => {
    expect(recurrenceLabel({ frequency: 'Weekly', interval: 1 })).toBe('Every week');
    expect(recurrenceLabel({ frequency: 'Daily', interval: 3 })).toBe('Every 3 days');
    expect(recurrenceLabel({ frequency: 'Monthly', interval: 2 })).toBe('Every 2 months');
  });
});
