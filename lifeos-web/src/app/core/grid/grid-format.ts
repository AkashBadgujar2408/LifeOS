import { formatDate, formatNumber } from '@angular/common';
import { ValueFormatterParams } from 'ag-grid-community';
import { APP_DATE_FORMAT, APP_DATE_TIME_FORMAT } from '../dates/date-format';

/** Cell formatters shared by the data grids, so a grid (and its CSV) shows days as 14/Oct/2026 like the rest. */
export function dayFormatter(locale: string) {
  return (p: ValueFormatterParams): string =>
    p.value ? formatDate(p.value as string, APP_DATE_FORMAT, locale) : '';
}

export function dayTimeFormatter(locale: string) {
  return (p: ValueFormatterParams): string =>
    p.value ? formatDate(p.value as string, APP_DATE_TIME_FORMAT, locale) : '';
}

export function numberFormatter(locale: string, digits = '1.0-2') {
  return (p: ValueFormatterParams): string =>
    p.value === null || p.value === undefined || p.value === ''
      ? ''
      : formatNumber(p.value as number, locale, digits);
}

/** Newest first, and the same day keeps the server's order (higher id = added later = first). */
export function dayComparator(
  a: string | null,
  b: string | null,
  nodeA: { data?: { id?: number } },
  nodeB: { data?: { id?: number } },
): number {
  if (a === b) {
    return (nodeA.data?.id ?? 0) - (nodeB.data?.id ?? 0);
  }
  return (a ?? '') < (b ?? '') ? -1 : 1;
}
