import type { Employment } from '../../core/services/career.service';
import { changeText, currentRoles, formatPay, stints } from './career-view';

function role(
  id: number,
  organisation: string,
  startDate: string,
  endDate: string | null,
  title = `Role ${id}`,
): Employment {
  return {
    id,
    organisation,
    role: title,
    employmentType: 'FullTime',
    location: null,
    startDate,
    endDate,
    description: null,
    achievementCount: 0,
  };
}

describe('stints', () => {
  it('groups back-to-back roles at one organisation, newest first', () => {
    const result = stints([
      role(1, 'Initech', '2019-07-01', '2021-12-31'),
      role(2, 'Acme Corp', '2022-01-10', '2024-03-31', 'Developer'),
      role(3, 'acme corp', '2024-04-01', null, 'Senior Developer'),
    ]);
    expect(result.map((s) => s.organisation)).toEqual(['acme corp', 'Initech']);
    expect(result[0].roles.map((r) => r.role)).toEqual(['Senior Developer', 'Developer']);
    expect(result[0].startDate).toBe('2022-01-10');
    expect(result[0].endDate).toBeNull();
    expect(result[1].endDate).toBe('2021-12-31');
  });

  it('makes going back to an earlier employer a new stint', () => {
    const result = stints([
      role(1, 'Acme', '2018-01-01', '2019-12-31'),
      role(2, 'Globex', '2020-01-01', '2021-12-31'),
      role(3, 'Acme', '2022-01-01', null),
    ]);
    expect(result.map((s) => s.organisation)).toEqual(['Acme', 'Globex', 'Acme']);
  });
});

describe('currentRoles', () => {
  it('keeps roles with no end date, latest first', () => {
    const result = currentRoles([
      role(1, 'A', '2020-01-01', null),
      role(2, 'B', '2021-01-01', '2022-01-01'),
      role(3, 'C', '2024-01-01', null),
    ]);
    expect(result.map((r) => r.id)).toEqual([3, 1]);
  });
});

describe('formatPay + changeText', () => {
  it('reads money with its period', () => {
    expect(formatPay(1650000, 'INR', 'Year')).toBe('₹16,50,000 a year');
    expect(formatPay(70, 'EUR', 'Hour', 'en-GB')).toBe('€70 an hour');
    expect(formatPay(12.5, 'USD', 'Hour', 'en-US')).toBe('$12.50 an hour');
  });

  it('signs the change', () => {
    expect(changeText(null)).toBe('');
    expect(changeText(0)).toBe('No change');
    expect(changeText(25)).toBe('+25%');
    expect(changeText(-6.7)).toBe('−6.7%');
  });
});
