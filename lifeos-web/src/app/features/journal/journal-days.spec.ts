import { MOODS, averageMood, moodMeta, moodSeries, weekStartIso } from './journal-days';

describe('weekStartIso', () => {
  it('returns the Monday of the week, Sunday belonging to the week before it', () => {
    expect(weekStartIso('2026-10-12')).toBe('2026-10-12');
    expect(weekStartIso('2026-10-15')).toBe('2026-10-12');
    expect(weekStartIso('2026-10-18')).toBe('2026-10-12');
  });

  it('crosses month and year ends', () => {
    expect(weekStartIso('2026-10-01')).toBe('2026-09-28');
    expect(weekStartIso('2027-01-03')).toBe('2026-12-28');
  });
});

describe('moodSeries', () => {
  it('fills every day of the range, null where no mood was recorded', () => {
    const series = moodSeries(
      [
        { entryDate: '2026-10-13', mood: 2 },
        { entryDate: '2026-10-15', mood: 5 },
      ],
      '2026-10-12',
      '2026-10-15',
    );
    expect(series).toEqual([
      { day: '2026-10-12', mood: null },
      { day: '2026-10-13', mood: 2 },
      { day: '2026-10-14', mood: null },
      { day: '2026-10-15', mood: 5 },
    ]);
  });

  it('runs across a month end', () => {
    expect(moodSeries([], '2026-10-30', '2026-11-02').map((d) => d.day)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});

describe('averageMood', () => {
  it('averages recorded moods to one decimal, ignoring empty days', () => {
    expect(averageMood([2, null, 5, 4])).toBe(3.7);
  });

  it('is null with no moods', () => {
    expect(averageMood([null, null])).toBeNull();
    expect(averageMood([])).toBeNull();
  });
});

describe('moodMeta', () => {
  it('maps 1-5 onto the scale in order', () => {
    expect(moodMeta(1).label).toBe('Awful');
    expect(moodMeta(5).label).toBe('Great');
    expect(MOODS.map((m) => m.value)).toEqual([1, 2, 3, 4, 5]);
  });
});
