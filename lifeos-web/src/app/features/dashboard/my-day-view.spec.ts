import { MyDay, MyDayHabit, MyDayTask } from '../../core/services/dashboard.service';
import {
  balanceSummary,
  daySummary,
  daysBetween,
  habitToday,
  habitsInOrder,
  insightLink,
  joinNames,
  laterToday,
  splitTasks,
  withoutHiddenModules,
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
    expiringDocuments: [],
    insights: [],
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
            isRecurring: false,
            occurrenceDate: null,
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

describe('insightLink', () => {
  const base = { kind: 'GoalUntouched' as const, tone: 'Nudge' as const, message: '' };

  it('points habits and goals at their page, and page-level insights at the page', () => {
    expect(insightLink({ ...base, entityType: 'Goal', entityId: 7 })?.link).toEqual(['/goals', 7]);
    expect(insightLink({ ...base, entityType: 'Habit', entityId: 3 })?.link).toEqual([
      '/habits',
      3,
    ]);
    expect(insightLink({ ...base, entityType: 'Journal', entityId: null })?.link).toEqual([
      '/journal',
    ]);
    expect(insightLink({ ...base, entityType: 'Tasks', entityId: null })?.link).toEqual(['/tasks']);
  });

  it('has nothing to open without a target', () => {
    expect(insightLink({ ...base, entityType: null, entityId: null })).toBeNull();
    expect(insightLink({ ...base, entityType: 'Goal', entityId: null })).toBeNull();
  });
});

describe('balanceSummary / joinNames', () => {
  const area = (lifeAreaName: string, points: number) => ({
    lifeAreaId: 0,
    lifeAreaName,
    activeGoals: 0,
    goalsCompleted: 0,
    milestonesCompleted: 0,
    habitTicks: 0,
    journalEntries: 0,
    points,
    score: 0,
  });

  it('names the busiest areas (ties included) and the ones with nothing', () => {
    expect(
      balanceSummary([area('Career', 0), area('Health', 7), area('Learning', 7), area('Fun', 1)]),
    ).toEqual({ busiest: ['Health', 'Learning'], quiet: ['Career'] });
  });

  it('says nothing when nothing happened', () => {
    expect(balanceSummary([area('Career', 0), area('Health', 0)])).toEqual({
      busiest: [],
      quiet: [],
    });
  });

  it('joins names like a sentence', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Health'])).toBe('Health');
    expect(joinNames(['Health', 'Career'])).toBe('Health and Career');
    expect(joinNames(['Health', 'Career', 'Fun'])).toBe('Health, Career and Fun');
  });
});

describe('withoutHiddenModules', () => {
  const insight = (entityType: 'Habit' | 'Goal' | 'Journal' | 'Tasks' | null) => ({
    kind: 'GoalUntouched' as const,
    tone: 'Nudge' as const,
    message: String(entityType),
    entityType,
    entityId: entityType === 'Habit' || entityType === 'Goal' ? 1 : null,
  });

  const full = myDay({
    tasks: [task(1, TODAY)],
    habits: [habit(1, false, true)],
    insights: [insight('Habit'), insight('Tasks'), insight('Goal'), insight(null)],
  });

  it('returns the day unchanged when nothing is hidden', () => {
    expect(withoutHiddenModules(full, new Set())).toBe(full);
  });

  it("empties hidden modules' data and drops their insights, so the summary follows", () => {
    const shown = withoutHiddenModules(full, new Set(['Habits', 'Tasks']));

    expect(shown.habits).toEqual([]);
    expect(shown.tasks).toEqual([]);
    expect(shown.insights.map((i) => i.entityType)).toEqual(['Goal', null]);
    expect(daySummary(shown)).toEqual([]);
    expect(daySummary(full)).toEqual(['1 task left', '1 habit to tick']);
  });
});
