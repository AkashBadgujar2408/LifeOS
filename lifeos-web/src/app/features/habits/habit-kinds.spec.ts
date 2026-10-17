import { Habit } from '../../core/services/habits.service';
import { applyEntry, canToggle, formatAmount, habitDayState, targetLabel } from './habit-schedule';

// 2026-10-15 is the "today" used below.
const TODAY = '2026-10-15';

function habit(fields: Partial<Habit>): Habit {
  return {
    id: 1,
    title: 'Read',
    description: null,
    lifeAreaId: null,
    lifeAreaName: null,
    scheduleDays: 127,
    startDate: '2026-10-10',
    status: 'Active',
    kind: 'Build',
    targetValue: null,
    unit: null,
    tags: [],
    createdAt: '2026-10-10T08:00:00Z',
    streak: { current: 0, longest: 0, doneToday: false, dueToday: true, lastMissed: null },
    cleanRun: null,
    doneDates: [],
    values: {},
    slipDates: [],
    ...fields,
  };
}

describe('habitDayState', () => {
  it('marks a measurable day logged short of its target as partial, a met one as done', () => {
    const read = habit({
      targetValue: 20,
      doneDates: ['2026-10-13'],
      values: { '2026-10-13': 20, '2026-10-14': 12, '2026-10-15': 5 },
    });

    expect(habitDayState(read, '2026-10-13', TODAY)).toBe('done');
    expect(habitDayState(read, '2026-10-14', TODAY)).toBe('partial');
    expect(habitDayState(read, '2026-10-15', TODAY)).toBe('partial');
    expect(habitDayState(read, '2026-10-12', TODAY)).toBe('missed');
  });

  it('reads an avoid habit as clean or slipped, today included', () => {
    const smoking = habit({ kind: 'Avoid', slipDates: ['2026-10-12'] });

    expect(habitDayState(smoking, '2026-10-12', TODAY)).toBe('slipped');
    expect(habitDayState(smoking, '2026-10-13', TODAY)).toBe('clean');
    expect(habitDayState(smoking, TODAY, TODAY)).toBe('clean');
    expect(habitDayState(smoking, '2026-10-09', TODAY)).toBe('notStarted');
    expect(habitDayState(smoking, '2026-10-16', TODAY)).toBe('future');
  });

  it('lets partial, clean and slipped days be clicked', () => {
    expect(canToggle('partial')).toBe(true);
    expect(canToggle('clean')).toBe(true);
    expect(canToggle('slipped')).toBe(true);
  });
});

describe('applyEntry', () => {
  it('keeps a measurable day value and only counts it done once the API says it met the target', () => {
    const read = habit({ targetValue: 20 });
    const streak = { current: 0, longest: 0, doneToday: false, dueToday: true, lastMissed: null };

    const partial = applyEntry(read, {
      entryDate: TODAY,
      done: false,
      value: 12,
      streak,
      cleanRun: null,
    });
    expect(partial.values[TODAY]).toBe(12);
    expect(partial.doneDates).toEqual([]);

    const cleared = applyEntry(partial, {
      entryDate: TODAY,
      done: false,
      value: null,
      streak,
      cleanRun: null,
    });
    expect(cleared.values[TODAY]).toBeUndefined();
  });

  it('adds and removes an avoid habit slip with its new clean run', () => {
    const smoking = habit({ kind: 'Avoid' });
    const run = { current: 0, longest: 5, slippedToday: true, lastSlip: TODAY };

    const slipped = applyEntry(smoking, {
      entryDate: TODAY,
      done: true,
      value: null,
      streak: smoking.streak,
      cleanRun: run,
    });
    expect(slipped.slipDates).toEqual([TODAY]);
    expect(slipped.cleanRun).toEqual(run);
    expect(slipped.doneDates).toEqual([]);
  });
});

describe('targetLabel / formatAmount', () => {
  it('writes amounts the way people do', () => {
    expect(formatAmount(20)).toBe('20');
    expect(formatAmount(12.5)).toBe('12.5');
    expect(targetLabel({ targetValue: 20, unit: 'pages' })).toBe('20 pages');
    expect(targetLabel({ targetValue: 8, unit: null })).toBe('8');
    expect(targetLabel({ targetValue: null, unit: null })).toBeNull();
  });
});
