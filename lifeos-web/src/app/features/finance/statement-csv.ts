import { ImportLine } from '../../core/services/finance.service';

/**
 * Reading bank statements (CSV) in the browser: the file never leaves the page until its lines are mapped, and the
 * server only ever sees clean { day, signed amount, description, reference } lines. Banks disagree on everything —
 * separators, date formats, one signed amount column or separate debit/credit columns, "1,234.56" or "(1,234.56)"
 * or "1234.56 Dr" — so each of those is a choice in the mapping, not a guess baked in.
 */

/** Splits CSV text into rows of cells (RFC 4180 quotes, "" for a quote inside one); blank rows are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** Comma, semicolon or tab — whichever splits the first line into the most cells (outside quotes). */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t']) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === candidate && !quoted) {
        count++;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export const DATE_FORMATS = [
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'dd MMM yyyy',
  'dd/MM/yy',
] as const;
export type StatementDateFormat = (typeof DATE_FORMATS)[number];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A statement date in the chosen format → "yyyy-MM-dd", or null if it isn't one (or isn't a real day). */
export function parseStatementDate(text: string, format: StatementDateFormat): string | null {
  const value = text.trim();
  let day: number;
  let month: number;
  let year: number;
  let match: RegExpMatchArray | null;
  switch (format) {
    case 'yyyy-MM-dd':
      match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!match) return null;
      [year, month, day] = [+match[1], +match[2], +match[3]];
      break;
    case 'dd MMM yyyy':
      // "05 Oct 2026", "5-Oct-2026", "05/Oct/2026", "5 October 2026"
      match = value.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,})[\s\-/.,]+(\d{2,4})$/);
      if (!match) return null;
      day = +match[1];
      month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
      year = fullYear(+match[3], match[3].length);
      break;
    default: {
      const separator = format[2];
      const parts = value.split(separator);
      if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
      const first = format.startsWith('MM') ? 1 : 0;
      day = +parts[first];
      month = +parts[1 - first];
      year = fullYear(+parts[2], parts[2].length);
    }
  }
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 9999) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Two-digit years are this century (statements aren't from the 1900s). */
function fullYear(year: number, digits: number): number {
  return digits <= 2 ? 2000 + year : year;
}

/**
 * A statement amount → a number: "1,234.56", "-1234.56", "(1,234.56)" (negative), "1234.56 Dr" (negative) /
 * "Cr", "₹ 1,234", "1.234,56" when `decimalComma`. Blank → null (an empty debit or credit cell).
 */
export function parseAmount(text: string, decimalComma = false): number | null {
  let value = text.trim();
  if (value === '' || value === '-') {
    return null;
  }
  let sign = 1;
  if (/^\(.*\)$/.test(value)) {
    sign = -1;
    value = value.slice(1, -1);
  }
  const suffix = value.match(/\s*(dr|cr)\.?$/i);
  if (suffix) {
    if (suffix[1].toLowerCase() === 'dr') sign = -sign;
    value = value.slice(0, suffix.index);
  }
  value = value.replace(/[^\d.,\-+]/g, '');
  if (value.startsWith('-')) {
    sign = -sign;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  value = decimalComma ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(value) && !/^\.\d+$/.test(value)) {
    return null;
  }
  return sign * Number(value);
}

/** Which column holds what (indexes into a row; null = not in this file). */
export interface StatementMapping {
  hasHeader: boolean;
  date: number | null;
  dateFormat: StatementDateFormat;
  /** One signed column ("amount"), or separate money-out / money-in columns ("split"). */
  amountMode: 'amount' | 'split';
  amount: number | null;
  /** In "amount" mode: positive numbers are money out (some card statements). */
  amountOutIsPositive: boolean;
  debit: number | null;
  credit: number | null;
  description: number | null;
  reference: number | null;
  decimalComma: boolean;
}

export interface MappedRow {
  /** 1-based line in the file, for messages ("line 14"). */
  fileLine: number;
  line: ImportLine | null;
  error: string | null;
}

/** Applies a mapping to the parsed rows: each row becomes an import line or says what's wrong with it. */
export function mapStatement(rows: readonly string[][], mapping: StatementMapping): MappedRow[] {
  const start = mapping.hasHeader ? 1 : 0;
  const out: MappedRow[] = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const cell = (index: number | null) => (index === null ? '' : (row[index] ?? ''));
    const fileLine = i + 1;
    const occurredOn = parseStatementDate(cell(mapping.date), mapping.dateFormat);
    if (!occurredOn) {
      out.push({
        fileLine,
        line: null,
        error: cell(mapping.date)
          ? `"${cell(mapping.date)}" isn't a ${mapping.dateFormat} date.`
          : 'No date.',
      });
      continue;
    }

    let amount: number | null;
    if (mapping.amountMode === 'amount') {
      amount = parseAmount(cell(mapping.amount), mapping.decimalComma);
      if (amount !== null && mapping.amountOutIsPositive) {
        amount = -amount;
      }
    } else {
      const moneyOut = parseAmount(cell(mapping.debit), mapping.decimalComma);
      const moneyIn = parseAmount(cell(mapping.credit), mapping.decimalComma);
      amount =
        moneyOut === null && moneyIn === null ? null : (moneyIn ?? 0) - Math.abs(moneyOut ?? 0);
    }
    if (amount === null || amount === 0) {
      out.push({ fileLine, line: null, error: 'No amount.' });
      continue;
    }

    out.push({
      fileLine,
      line: {
        occurredOn,
        amount: Math.round(amount * 10000) / 10000,
        description: cell(mapping.description) || null,
        reference: cell(mapping.reference) || null,
      },
      error: null,
    });
  }
  return out;
}

/** A starting mapping from the header names (Date / Narration / Withdrawal / Deposit / Amount / Ref ...). */
export function guessMapping(header: readonly string[]): StatementMapping {
  // Whole words only: "cr" mustn't match "desCRiption".
  const words = header.map((h) => ` ${h.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `);
  const find = (...wanted: string[]) => {
    const index = words.findIndex((h) => wanted.some((w) => h.includes(` ${w} `)));
    return index < 0 ? null : index;
  };
  const debit = find('debit', 'withdrawal', 'paid out', 'money out', 'dr');
  const credit = find('credit', 'deposit', 'paid in', 'money in', 'cr');
  const split = debit !== null && credit !== null && debit !== credit;
  return {
    hasHeader: true,
    date: find('date'),
    dateFormat: 'dd/MM/yyyy',
    amountMode: split ? 'split' : 'amount',
    amount: split ? null : find('amount', 'amt'),
    amountOutIsPositive: false,
    debit: split ? debit : null,
    credit: split ? credit : null,
    description: find('description', 'narration', 'details', 'particulars', 'payee', 'memo'),
    reference: find('ref', 'cheque', 'chq', 'transaction id'),
    decimalComma: false,
  };
}
