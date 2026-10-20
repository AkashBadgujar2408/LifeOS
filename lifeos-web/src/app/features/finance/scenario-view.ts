import type {
  ScenarioGoal,
  ScenarioImpact,
  ScenarioLineKind,
  ScenarioLow,
} from '../../core/services/finance.service';
import { formatMoney } from './finance-view';

export interface ScenarioKindInfo {
  kind: ScenarioLineKind;
  label: string;
  amountLabel: string;
  placeholder: string;
}

/** The order the "Add a what-if" menu offers them in. */
export const SCENARIO_KINDS: readonly ScenarioKindInfo[] = [
  { kind: 'Purchase', label: 'A purchase', amountLabel: 'Price', placeholder: 'New car' },
  {
    kind: 'MonthlyCost',
    label: 'A monthly cost',
    amountLabel: 'A month',
    placeholder: 'Gym membership',
  },
  {
    kind: 'MonthlyIncome',
    label: 'Monthly income',
    amountLabel: 'A month',
    placeholder: 'Weekend tutoring',
  },
  {
    kind: 'PayChange',
    label: 'A pay change',
    amountLabel: 'Change a month (− for less)',
    placeholder: 'New job',
  },
  { kind: 'Loan', label: 'A loan', amountLabel: 'Borrowed', placeholder: 'Car loan' },
];

export const SCENARIO_KIND_LABELS: Record<ScenarioLineKind, string> = Object.fromEntries(
  SCENARIO_KINDS.map((k) => [k.kind, k.label]),
) as Record<ScenarioLineKind, string>;

/** Monthly kinds repeat every month from their start and may have an end. */
export function isMonthlyKind(kind: ScenarioLineKind): boolean {
  return kind === 'MonthlyCost' || kind === 'MonthlyIncome' || kind === 'PayChange';
}

/** "3 months", "2 years", "1 year 4 months"; 0 = already there; null = not within 100 years. */
export function monthsText(months: number | null): string {
  if (months === null) {
    return 'not within 100 years';
  }
  if (months === 0) {
    return 'already reached';
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} year${years === 1 ? '' : 's'}` : '';
  const m = rest ? `${rest} month${rest === 1 ? '' : 's'}` : '';
  return [y, m].filter(Boolean).join(' ');
}

/** How the scenario moves a goal: "4 months later", "no change", "out of reach". */
export function goalShiftText(goal: ScenarioGoal): string {
  const { monthsBefore: before, monthsAfter: after } = goal;
  if (before === after) {
    return 'no change';
  }
  if (after === null) {
    return 'out of reach';
  }
  if (before === null) {
    return 'within reach';
  }
  const diff = after - before;
  return `${monthsText(Math.abs(diff))} ${diff > 0 ? 'later' : 'sooner'}`;
}

/** Retirement before → after in words. */
export function retirementShiftText(ageBefore: number | null, ageAfter: number | null): string {
  if (ageBefore === ageAfter) {
    return 'no change';
  }
  if (ageAfter === null) {
    return 'not by 100';
  }
  if (ageBefore === null) {
    return `by ${ageAfter}`;
  }
  const diff = ageAfter - ageBefore;
  const years = `${Math.abs(diff)} year${Math.abs(diff) === 1 ? '' : 's'}`;
  return `${years} ${diff > 0 ? 'later' : 'sooner'}`;
}

/**
 * The answer in one sentence, from the lowest point of all accounts over the next 12 months: still above zero, now
 * dipping below it, or deeper below than it already was.
 */
export function affordVerdict(impact: ScenarioImpact, formatDay: (iso: string) => string): string {
  const low: ScenarioLow | undefined = impact.lows[0];
  const currency = impact.baseCurrency;
  if (!low || !currency) {
    return 'Choose a base currency in Finance to see what this does to your money.';
  }
  const money = (n: number) => formatMoney(n, currency);
  const day = formatDay(low.after.day);
  if (low.after.balance >= 0) {
    const less = low.before.balance - low.after.balance;
    return less > 0
      ? `Yes — your balances stay above zero. The lowest point in the next 12 months would be ${money(low.after.balance)} (${day}), ${money(less)} lower than without it.`
      : `Yes — your balances stay above zero; the lowest point would be ${money(low.after.balance)} (${day}).`;
  }
  return low.before.balance >= 0
    ? `Not as things stand — your balances would dip below zero, to ${money(low.after.balance)} around ${day}.`
    : `Your balances already dip below zero ahead; this would take the lowest point to ${money(low.after.balance)} around ${day}.`;
}

/** The query parameters a "Can I afford it?" link carries (wishlist, planned purchases). */
export interface AffordPrefill {
  name: string;
  amount: number | null;
  currency: string | null;
}

export function readAffordPrefill(params: {
  get(name: string): string | null;
}): AffordPrefill | null {
  const name = params.get('name')?.trim();
  if (!name) {
    return null;
  }
  const raw = params.get('amount');
  const amount = raw !== null && raw !== '' && Number(raw) > 0 ? Number(raw) : null;
  return { name: name.slice(0, 200), amount, currency: params.get('currency') || null };
}
