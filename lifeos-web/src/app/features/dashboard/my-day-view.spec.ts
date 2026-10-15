import { MyDay, MyDayHabit, MyDayTask } from '../../core/services/dashboard.service';
import {
  daySummary,
  daysBetween,
  habitToday,
  habitsInOrder,
  laterToday,
  splitTasks,
} from './my-day-view';

const TODAY = '2026-10-15';

function task(id: number, dueDate: string, isDone = false): MyDayTask {
  return {
    id,
    title: `Task ${id}`,
    dueDate,
    priority: 'None',
    isDone,
    isRecurring: false,
    projectId: null,
    projectName: null,
  };
}

function habit(id: number, doneToday: boolean, dueToday: boolean): MyDayHabit {
  return {
    id,
    title: `Habit ${id}`,
    scheduleDays: 127,
    startDate: '2026-10-01',
    lifeAreaName: null,
    streak: { current: 0, longest: 0, doneToday, dueToday, lastMissed: null },
  };
}

function myDay(overrides: Partial<MyDay>): MyDay {
  return {
    today: TODAY,
    tasks: [],
    events: [],
    reminders: [],
    goals: [],
    habits: [],
    latestJournalEntry: null,
    ...overrides,
  };
}

describe('splitTasks', () => {
  it('puts open tasks from before today under overdue, in the given order', () => {
    const { overdue, today } = splitTasks(
      [task(1, '2026-10-12'), task(2, '2026-10-14'), task(3, TODAY), task(4, TODAY, true)],
      TODAY,
    );
    expect(overdue.map((t) => t.id)).toEqual([1, 2]);
    expect(today.map((t) => t.id)).toEqual([3, 4]);
  });
});

describe('habitToday / habitsInOrder', () => {
  it('reads the state from the streak', () => {
    expect(habitToday(habit(1, false, true))).toBe('open');
    expect(habitToday(habit(1, true, true))).toBe('done');
    expect(habitToday(habit(1, false, false))).toBe('off');
    // Ticked on an unscheduled day still counts as done.
    expect(habitToday(habit(1, true, false))).toBe('done');
  });

  it('lists what is left first, then done, then not today', () => {
    const ordered = habitsInOrder([
      habit(1, false, false),
      habit(2, true, true),
      habit(3, false, true),
    ]);
    expect(ordered.map((h) => h.id)).toEqual([3, 2, 1]);
  });
});

describe('laterToday', () => {
  const reminders = [
    { id: 1, title: 'Past', remindAt: '2026-10-15T03:00:00Z', entityType: null, entityId: null },
    { id: 2, title: 'Later', remindAt: '2026-10-15T14:00:00Z', entityType: null, entityId: null },
    {
      id: 3,
      title: 'Due list',
      remindAt: '2026-10-15T15:00:00Z',
      entityType: null,
      entityId: null,
    },
  ];

  it('keeps only reminders still to come and not already in the due list', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    expect(laterToday(reminders, new Set([3]), now).map((r) => r.id)).toEqual([2]);
  });
});

describe('daysBetween', () => {
  it('counts whole local days either way', () => {
    expect(daysBetween('2026-10-13', TODAY)).toBe(2);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween('2026-10-20', TODAY)).toBe(-5);
  });
});

describe('daySummary', () => {
  it('says what is left, in words, leaving out zeros', () => {
    const summary = daySummary(
      myDay({
        tasks: [task(1, '2026-10-12'), task(2, TODAY), task(3, TODAY), task(4, TODAY, true)],
        events: [
          {
            id: 1,
            title: 'Standup',
            isAllDay: false,
            startDate: null,
            endDate: null,
            startsAt: '2026-10-15T04:00:00Z',
            endsAt: '2026-10-15T04:15:00Z',
            location: null,
          },
        ],
        habits: [habit(1, false, true), habit(2, true, true)],
      }),
    );
    expect(summary).toEqual(['2 tasks left', '1 overdue', '1 event', '1 habit to tick']);
  });

  it('is empty for a clear day', () => {
    expect(daySummary(myDay({ tasks: [task(1, TODAY, true)] }))).toEqual([]);
  });
});
