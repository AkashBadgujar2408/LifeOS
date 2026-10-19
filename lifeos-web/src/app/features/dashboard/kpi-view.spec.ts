import type { KpiTile } from '../../core/services/dashboard.service';
import { kpiComparison, kpiValueText, moveKey, visibleKpis } from './kpi-view';

const tile = (overrides: Partial<KpiTile>): KpiTile => ({
  key: 'tasks-done-week',
  label: 'Tasks done this week',
  module: 'Tasks',
  unit: 'Count',
  comparedWith: 'last week',
  value: 5,
  previous: 2,
  currency: null,
  ...overrides,
});

describe('kpiValueText', () => {
  it('reads counts, percents and minutes', () => {
    expect(kpiValueText(12, 'Count')).toBe('12');
    expect(kpiValueText(87, 'Percent')).toBe('87%');
    expect(kpiValueText(45, 'Minutes')).toBe('45m');
    expect(kpiValueText(120, 'Minutes')).toBe('2h');
    expect(kpiValueText(105, 'Minutes')).toBe('1h 45m');
    expect(kpiValueText(null, 'Percent')).toBe('—');
  });
});

describe('kpiComparison', () => {
  it('says which way it moved and by how much', () => {
    expect(kpiComparison(tile({}))).toBe('Up 3 on last week');
    expect(kpiComparison(tile({ value: 1 }))).toBe('Down 1 on last week');
    expect(kpiComparison(tile({ value: 2 }))).toBe('Same as last week');
    expect(kpiComparison(tile({ unit: 'Minutes', value: 45, previous: 120 }))).toBe(
      'Down 1h 15m on last week',
    );
    expect(
      kpiComparison(
        tile({ unit: 'Percent', value: 87, previous: 80, comparedWith: 'the 30 days before' }),
      ),
    ).toBe('Up 7 points on the 30 days before');
  });

  it('falls back to the earlier figure, or nothing for tiles that do not compare', () => {
    expect(kpiComparison(tile({ unit: 'Percent', value: null, previous: 80 }))).toBe(
      '80% last week',
    );
    expect(kpiComparison(tile({ previous: null }))).toBeNull();
    expect(kpiComparison(tile({ comparedWith: null }))).toBeNull();
  });
});

describe('visibleKpis + moveKey', () => {
  it('drops tiles of hidden modules', () => {
    const tiles = [tile({}), tile({ key: 'journal-days-30', module: 'Journal' })];
    expect(visibleKpis(tiles, new Set(['Tasks'])).map((t) => t.key)).toEqual(['journal-days-30']);
  });

  it('swaps neighbours and ignores moves off either end', () => {
    expect(moveKey(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveKey(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveKey(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveKey(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('money tiles', () => {
  it('read in whole units of their currency and compare in money', () => {
    expect(kpiValueText(222320.4, 'Money', 'INR')).toBe('₹2,22,320');
    const worth = tile({
      key: 'net-worth',
      unit: 'Money',
      currency: 'INR',
      value: 222320,
      previous: 210000,
      comparedWith: "last month's end",
    });
    expect(kpiComparison(worth)).toBe("Up ₹12,320 on last month's end");
    expect(kpiComparison({ ...worth, value: 200000 })).toBe("Down ₹10,000 on last month's end");
  });
});
