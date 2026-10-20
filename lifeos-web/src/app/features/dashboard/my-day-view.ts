import { localMidnight } from '../../core/dates/today';
import {
  Insight,
  LifeBalanceArea,
  MyDay,
  MyDayHabit,
  MyDayReminder,
  MyDayTask,
} from '../../core/services/dashboard.service';
import type { ModuleKey } from '../../core/services/settings.service';

/** What a habit asks of you today: tick it, already ticked, or nothing (not on its schedule). */
export type HabitToday = 'open' | 'done' | 'off';

export function habitToday(habit: MyDayHabit): HabitToday {
  if (habit.streak.doneToday) {
    return 'done';
  }
  return habit.streak.dueToday ? 'open' : 'off';
}

/**
 * My Day's habits split by routine: each routine with its habits (in the routine's order, only those on My Day), then
 * the habits in no routine. A habit in two routines shows in both; a routine with none of today's habits is left out.
 */
export function groupByRoutine<R extends { id: number; habitIds: readonly number[] }>(
  habits: readonly MyDayHabit[],
  routines: readonly R[],
): { routines: { routine: R; habits: MyDayHabit[] }[]; others: MyDayHabit[] } {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const inRoutine = new Set<number>();
  const groups = routines
    .map((routine) => {
      const members = routine.habitIds
        .map((id) => byId.get(id))
        .filter((h): h is MyDayHabit => h !== undefined);
      members.forEach((h) => inRoutine.add(h.id));
      return { routine, habits: members };
    })
    .filter((group) => group.habits.length > 0);
  return { routines: groups, others: habits.filter((h) => !inRoutine.has(h.id)) };
}

/** Still to do first, then done today, then the ones that aren't on today; the API's (title) order within each. */
export function habitsInOrder(habits: readonly MyDayHabit[]): MyDayHabit[] {
  const rank: Record<HabitToday, number> = { open: 0, done: 1, off: 2 };
  return [...habits].sort((a, b) => rank[habitToday(a)] - rank[habitToday(b)]);
}

/** Overdue (due before today, still open) apart from today's; keeps the API's order inside each group. */
export function splitTasks(
  tasks: readonly MyDayTask[],
  today: string,
): { overdue: MyDayTask[]; today: MyDayTask[] } {
  return {
    overdue: tasks.filter((t) => t.dueDate < today && !t.isDone),
    today: tasks.filter((t) => t.dueDate >= today || t.isDone),
  };
}

/**
 * Reminders still to come later today. Ones already due are left out: the shell's due list (refreshed every
 * minute) shows those, so a reminder moves from here to there by itself as its time passes.
 */
export function laterToday(
  reminders: readonly MyDayReminder[],
  dueIds: ReadonlySet<number>,
  now: Date,
): MyDayReminder[] {
  return reminders.filter((r) => !dueIds.has(r.id) && new Date(r.remindAt) > now);
}

/** Whole local days from one "yyyy-MM-dd" to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((localMidnight(to).getTime() - localMidnight(from).getTime()) / 86_400_000);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The one line under the date: what today holds, in words ("3 tasks left · 1 overdue · 2 events · 1 habit to
 * tick"). Only non-zero parts; an empty list means a clear day.
 */
export function daySummary(myDay: MyDay): string[] {
  const { overdue, today } = splitTasks(myDay.tasks, myDay.today);
  const tasksLeft = today.filter((t) => !t.isDone).length;
  const habitsLeft = myDay.habits.filter((h) => habitToday(h) === 'open').length;

  const parts: string[] = [];
  if (tasksLeft > 0) {
    parts.push(plural(tasksLeft, 'task left', 'tasks left'));
  }
  if (overdue.length > 0) {
    parts.push(`${overdue.length} overdue`);
  }
  if (myDay.events.length > 0) {
    parts.push(plural(myDay.events.length, 'event', 'events'));
  }
  if (habitsLeft > 0) {
    parts.push(plural(habitsLeft, 'habit to tick', 'habits to tick'));
  }
  return parts;
}

/** Where acting on an insight happens: the habit or goal itself, or the Journal / Tasks page. */
export function insightLink(insight: Insight): { link: (string | number)[]; label: string } | null {
  switch (insight.entityType) {
    case 'Habit':
      return insight.entityId ? { link: ['/habits', insight.entityId], label: 'Open habit' } : null;
    case 'Goal':
      return insight.entityId ? { link: ['/goals', insight.entityId], label: 'Open goal' } : null;
    case 'Journal':
      return { link: ['/journal'], label: 'Write today' };
    case 'Tasks':
      return { link: ['/tasks'], label: 'Review tasks' };
    case 'Document':
      return insight.entityId
        ? { link: ['/documents', insight.entityId], label: 'Open document' }
        : null;
    case 'Budgets':
      return { link: ['/finance/budgets'], label: 'Open budgets' };
    case 'Forecast':
      return { link: ['/finance/forecast'], label: 'See the forecast' };
    default:
      return null;
  }
}

/** The wheel in one sentence: where most effort went (score 10, can tie) and which areas saw nothing at all. */
export function balanceSummary(areas: readonly LifeBalanceArea[]): {
  busiest: string[];
  quiet: string[];
} {
  if (areas.every((a) => a.points === 0)) {
    return { busiest: [], quiet: [] };
  }
  const top = Math.max(...areas.map((a) => a.points));
  return {
    busiest: areas.filter((a) => a.points === top).map((a) => a.lifeAreaName),
    quiet: areas.filter((a) => a.points === 0).map((a) => a.lifeAreaName),
  };
}

/** Joins names for a sentence: "Health", "Health and Career", "Health, Career and Finance". */
export function joinNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Which module an insight is about (its EntityType: an item kind, or a page).
const INSIGHT_MODULES: Record<string, ModuleKey> = {
  Habit: 'Habits',
  Goal: 'Goals',
  Journal: 'Journal',
  Tasks: 'Tasks',
  Document: 'Documents',
  Budgets: 'Finance',
  Forecast: 'Finance',
};

/**
 * My Day without the modules switched off in Settings: their data is emptied (so the header summary and the cards'
 * empty states follow) and their insights dropped. Reminders aren't touched here — the reminders card and the
 * "later today" list check the Reminders module themselves.
 */
export function withoutHiddenModules(myDay: MyDay, hidden: ReadonlySet<ModuleKey>): MyDay {
  if (hidden.size === 0) {
    return myDay;
  }
  const insightModule = (insight: Insight) =>
    insight.entityType ? INSIGHT_MODULES[insight.entityType] : undefined;
  return {
    ...myDay,
    tasks: hidden.has('Tasks') ? [] : myDay.tasks,
    events: hidden.has('Calendar') ? [] : myDay.events,
    habits: hidden.has('Habits') ? [] : myDay.habits,
    goals: hidden.has('Goals') ? [] : myDay.goals,
    latestJournalEntry: hidden.has('Journal') ? null : myDay.latestJournalEntry,
    expiringDocuments: hidden.has('Documents') ? [] : myDay.expiringDocuments,
    homeAgenda: hidden.has('Home') ? [] : myDay.homeAgenda,
    insights: myDay.insights.filter((insight) => {
      const module = insightModule(insight);
      return !module || !hidden.has(module);
    }),
  };
}
