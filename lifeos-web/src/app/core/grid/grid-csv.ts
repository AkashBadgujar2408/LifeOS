/**
 * CSV for the "Export CSV" button of every data grid (Session 75a): RFC 4180 quoting, CRLF line ends and a UTF-8
 * BOM so Excel opens ₹/€ and other characters correctly. Text a spreadsheet would run as a formula (starting with
 * = + - @, a tab or a carriage return) gets a leading apostrophe — same rule as the account export (Session 60).
 * A plain number ("-12.5", "1,200") is left alone so it stays a number.
 */
export const CSV_BOM = '﻿';

const PLAIN_NUMBER = /^[+-]?\d[\d,]*(\.\d+)?$/;

/** One cell's text: neutralised if it could run as a formula, quoted if it holds a comma, quote or line break. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.length > 0 && '=+-@\t\r'.includes(text[0]) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: BOM, the header row, then one line per row. */
export function buildCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** "lifeos-transactions-2026-10-21.csv" — the list's name made file-safe, plus the day. */
export function csvFileName(name: string, today: string): string {
  const safe = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `lifeos-${safe || 'list'}-${today}.csv`;
}
