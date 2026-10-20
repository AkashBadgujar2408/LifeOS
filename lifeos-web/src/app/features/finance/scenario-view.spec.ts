import type { ScenarioImpact } from '../../core/services/finance.service';
import {
  affordVerdict,
  goalShiftText,
  monthsText,
  readAffordPrefill,
  retirementShiftText,
} from './scenario-view';

const impact = (before: number, after: number): ScenarioImpact => ({
  baseCurrency: 'INR',
  until: '2027-10-20',
  lows: [
    {
      accountId: null,
      name: 'All accounts',
      before: { day: '2027-01-10', balance: before },
      after: { day: '2027-02-10', balance: after },
      endBefore: before,
      endAfter: after,
    },
  ],
  goals: [],
  retirement: null,
  nextTwelveMonths: after - before,
});
const day = (iso: string) => `[${iso}]`;

describe('scenario view', () => {
  it('words months as years and months', () => {
    expect(monthsText(0)).toBe('already reached');
    expect(monthsText(1)).toBe('1 month');
    expect(monthsText(12)).toBe('1 year');
    expect(monthsText(28)).toBe('2 years 4 months');
    expect(monthsText(null)).toBe('not within 100 years');
  });

  it('says how a goal moves', () => {
    const g = (before: number | null, after: number | null) => ({
      goalId: 1,
      title: 'Car',
      monthsBefore: before,
      monthsAfter: after,
    });
    expect(goalShiftText(g(12, 12))).toBe('no change');
    expect(goalShiftText(g(12, 16))).toBe('4 months later');
    expect(goalShiftText(g(24, 12))).toBe('1 year sooner');
    expect(goalShiftText(g(12, null))).toBe('out of reach');
    expect(goalShiftText(g(null, 40))).toBe('within reach');
    expect(retirementShiftText(55, 59)).toBe('4 years later');
    expect(retirementShiftText(60, 59)).toBe('1 year sooner');
    expect(retirementShiftText(55, null)).toBe('not by 100');
  });

  it('answers from the lowest point of all accounts', () => {
    expect(affordVerdict(impact(50_000, 20_000), day)).toContain('Yes');
    expect(affordVerdict(impact(50_000, 20_000), day)).toContain('[2027-02-10]');
    expect(affordVerdict(impact(50_000, -5_000), day)).toMatch(/^Not as things stand/);
    expect(affordVerdict(impact(-1_000, -5_000), day)).toMatch(/already dip below zero/);
    expect(affordVerdict({ ...impact(0, 0), baseCurrency: null, lows: [] }, day)).toMatch(
      /base currency/,
    );
  });

  it('reads a "Can I afford it?" link', () => {
    const params = (values: Record<string, string>) => ({
      get: (name: string) => values[name] ?? null,
    });
    expect(readAffordPrefill(params({}))).toBeNull();
    expect(readAffordPrefill(params({ name: ' Bike ', amount: '1200', currency: 'INR' }))).toEqual({
      name: 'Bike',
      amount: 1200,
      currency: 'INR',
    });
    expect(readAffordPrefill(params({ name: 'Bike', amount: 'abc' }))?.amount).toBeNull();
    expect(readAffordPrefill(params({ name: 'Bike', amount: '-3' }))?.amount).toBeNull();
  });
});
