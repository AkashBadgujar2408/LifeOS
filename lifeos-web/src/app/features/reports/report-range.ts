import { addDaysIso } from '../../core/dates/today';
import { ReportRange } from '../../core/services/reports.service';

/** The quick picks above every report; "custom" is two dates. */
export const REPORT_PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '3-months', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number]['key'];

export const DEFAULT_PRESET: ReportPreset = 'year';

/** The API's limit (ReportMath.MaxDays): about five years. */
export const MAX_REPORT_DAYS = 1830;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The last day of a month — on year/month numbers, never via a Date's month arithmetic. */
function monthEnd(year: number, month: number): string {
  const next = month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1);
  return addDaysIso(next, -1);
}

/** A preset's days for `today` ("yyyy-MM-dd"). "Last 3 months" is this month and the two before it, whole. */
export function presetRange(preset: ReportPreset, today: string): ReportRange {
  const [year, month] = today.split('-').map(Number);
  switch (preset) {
    case 'month':
      return { from: iso(year, month, 1), to: monthEnd(year, month) };
    case 'last-month': {
      const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
      return { from: iso(y, m, 1), to: monthEnd(y, m) };
    }
    case '3-months': {
      const [y, m] = month <= 2 ? [year - 1, month + 10] : [year, month - 2];
      return { from: iso(y, m, 1), to: monthEnd(year, month) };
    }
    case 'year':
      return { from: iso(year, 1, 1), to: iso(year, 12, 31) };
    case 'last-year':
      return { from: iso(year - 1, 1, 1), to: iso(year - 1, 12, 31) };
  }
}

/** Which preset a range is, if any (so the picker can show it as chosen). */
export function presetOf(range: ReportRange, today: string): ReportPreset | null {
  return (
    REPORT_PRESETS.find((p) => {
      const r = presetRange(p.key, today);
      return r.from === range.from && r.to === range.to;
    })?.key ?? null
  );
}

/** Whole days in a range, both ends included. */
export function rangeDays(range: ReportRange): number {
  const [fy, fm, fd] = range.from.split('-').map(Number);
  const [ty, tm, td] = range.to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** Why a range can't be asked for, or null. */
export function rangeError(range: ReportRange): string | null {
  if (range.to < range.from) {
    return 'The end date must be on or after the start date.';
  }
  return rangeDays(range) > MAX_REPORT_DAYS ? 'Pick at most five years.' : null;
}

/**
 * The range in the URL (`?from=&to=`, shared by every report tab so it survives switching and printing), or the
 * default preset when either is missing, malformed or not a usable range.
 */
export function readRange(
  from: string | null | undefined,
  to: string | null | undefined,
  today: string,
): ReportRange {
  if (from && to && ISO_DAY.test(from) && ISO_DAY.test(to) && !rangeError({ from, to })) {
    return { from, to };
  }
  return presetRange(DEFAULT_PRESET, today);
}
