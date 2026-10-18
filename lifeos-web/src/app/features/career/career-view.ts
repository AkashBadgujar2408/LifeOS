import type {
  CareerAchievementKind,
  Employment,
  EmploymentType,
  SalaryPeriod,
  SalaryReason,
} from '../../core/services/career.service';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FullTime: 'Full-time',
  PartTime: 'Part-time',
  Contract: 'Contract',
  Freelance: 'Freelance',
  Internship: 'Internship',
};

/** "₹16,50,000 a year". */
export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = {
  Year: 'a year',
  Month: 'a month',
  Hour: 'an hour',
};

export const SALARY_REASON_LABELS: Record<SalaryReason, string> = {
  Starting: 'Starting pay',
  Raise: 'Raise',
  Promotion: 'Promotion',
  Adjustment: 'Adjustment',
  Other: 'Other change',
};

export const ACHIEVEMENT_KIND_LABELS: Record<CareerAchievementKind, string> = {
  Project: 'Project',
  Promotion: 'Promotion',
  Award: 'Award',
  Contribution: 'Contribution',
  Other: 'Other',
};

export const ACHIEVEMENT_KIND_ICONS: Record<CareerAchievementKind, string> = {
  Project: 'bi-rocket-takeoff',
  Promotion: 'bi-arrow-up-circle',
  Award: 'bi-award',
  Contribution: 'bi-people',
  Other: 'bi-star',
};

/** A stretch at one organisation: its roles back to back, newest first. */
export interface Stint {
  organisation: string;
  startDate: string;
  /** Null while one of its roles is current. */
  endDate: string | null;
  roles: Employment[];
}

/**
 * The career timeline: roles newest first, with consecutive roles at the same organisation (a promotion, a change
 * of title) grouped into one stint. Going back to an earlier employer after working elsewhere is a new stint.
 */
export function stints(roles: readonly Employment[]): Stint[] {
  const sorted = [...roles].sort((a, b) =>
    a.startDate !== b.startDate ? (a.startDate < b.startDate ? 1 : -1) : b.id - a.id,
  );
  const result: Stint[] = [];
  for (const role of sorted) {
    const last = result[result.length - 1];
    if (last && last.organisation.toLocaleLowerCase() === role.organisation.toLocaleLowerCase()) {
      last.roles.push(role);
      last.startDate = role.startDate;
    } else {
      result.push({
        organisation: role.organisation,
        startDate: role.startDate,
        endDate: role.endDate,
        roles: [role],
      });
    }
  }
  for (const stint of result) {
    stint.endDate = stint.roles.some((r) => r.endDate === null)
      ? null
      : stint.roles.map((r) => r.endDate!).sort()[stint.roles.length - 1];
  }
  return result;
}

/** Roles with no end date, latest start first (usually one; a side contract makes two). */
export function currentRoles(roles: readonly Employment[]): Employment[] {
  return roles
    .filter((r) => r.endDate === null)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}

/** "₹16,50,000 a year", "€70 an hour" — no decimals unless the amount has them. */
export function formatPay(
  amount: number,
  currency: string,
  period: SalaryPeriod,
  locale = 'en-IN',
): string {
  const whole = Number.isInteger(amount);
  let money: string;
  try {
    money = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    // A code Intl doesn't know still reads sensibly.
    money = `${currency} ${amount.toLocaleString(locale)}`;
  }
  return `${money} ${SALARY_PERIOD_LABELS[period]}`;
}

/** "+10%", "−6.7%", "No change"; empty for the first record of its kind. */
export function changeText(percent: number | null): string {
  if (percent === null) {
    return '';
  }
  if (percent === 0) {
    return 'No change';
  }
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}
