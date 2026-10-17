import { Habit } from '../../core/services/habits.service';
import { HEATMAP_WEEKS, heatmapStart, weekdayConsistency, yearGrid } from './habit-analytics';

// 2026-10-17 is a Saturday.
const TODAY = '2026-10-17';

function habit(fields: Partial<Habit>): Habit {
  return {
    id: 1,
    title: 'Stretch',
    description: null,
    lifeAreaId: null,
    lifeAreaName: null,
    scheduleDays: 127,
    startDate: '2026-10-05',
    status: 'Active',
    kind: 'Build',
    targetValue: null,
    unit: null,
    tags: [],
    createdAt: '2026-10-05T08:00:00Z',
    streak: { current: 0, longest: 0, doneToday: false, dueToday: true, lastMissed: null },
    cleanRun: null,
    doneDates: [],
    values: {},
    slipDates: [],
    challenges: [],
    ...fields,
  };
}

describe('yearGrid', () => {
  it('runs 53 Monday-aligned weeks ending with this one', () => {
    const grid = yearGrid(habit({}), TODAY);

    expect(grid.length).toBe(HEATMAP_WEEKS);
    expect(heatmapStart(TODAY)).toBe('2025-10-13');
    expect(grid[0].monday).toBe('2025-10-13');
    expect(grid[HEATMAP_WEEKS - 1].monday).toBe('2026-10-12');
    expect(grid[HEATMAP_WEEKS - 1].days[6].state).toBe('future');
  });

  it('labels the columns where a month starts', () => {
    const grid = yearGrid(habit({}), TODAY);
    const october = grid.find((w) => w.monday === '2026-09-28');

    expect(grid[0].monthLabel).toBe('Oct');
    expect(october?.monthLabel).toBe('Oct');
    expect(grid.find((w) => w.monday === '2026-10-05')?.monthLabel).toBeNull();
  });
});

describe('weekdayConsistency', () => {
  it('shares scheduled days done per weekday, not counting an unfinished today', () => {
    // 5–16 Oct every day; done on both Mondays (5, 12) and one Tuesday (6).
    const rows = weekdayConsistency(
      habit({ doneDates: ['2026-10-05', '2026-10-06', '2026-10-12'] }),
      '2026-10-01',
      TODAY,
    );

    expect(rows[0]).toEqual({ weekday: 'Mon', total: 2, good: 2, percent: 100 });
    expect(rows[1]).toEqual({ weekday: 'Tue', total: 2, good: 1, percent: 50 });
    expect(rows[5]).toEqual({ weekday: 'Sat', total: 1, good: 0, percent: 0 });
  });

  it('counts clean days for a habit being broken', () => {
    const rows = weekdayConsistency(
      habit({ kind: 'Avoid', slipDates: ['2026-10-09'] }),
      '2026-10-01',
      TODAY,
    );

    expect(rows[4]).toEqual({ weekday: 'Fri', total: 2, good: 1, percent: 50 });
    expect(rows[5]).toEqual({ weekday: 'Sat', total: 2, good: 2, percent: 100 });
  });

  it('has no percentage for a weekday the habit never runs', () => {
    const rows = weekdayConsistency(habit({ scheduleDays: 1 }), '2026-10-01', TODAY);

    expect(rows[2].percent).toBeNull();
  });
});
