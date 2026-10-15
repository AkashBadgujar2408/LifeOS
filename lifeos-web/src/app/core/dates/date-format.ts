import { Injectable, Provider } from '@angular/core';
import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import { NgbDateAdapter, NgbDateParserFormatter, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

/**
 * The one date format for the whole app: 14/Oct/2026. A bare `| date` uses it (via the provider below);
 * add a time with `| date: APP_DATE_TIME_FORMAT`.
 */
export const APP_DATE_FORMAT = 'dd/MMM/yyyy';
export const APP_DATE_TIME_FORMAT = 'dd/MMM/yyyy, h:mm a';
/** Compact day + month for range labels inside one screen ("09/Oct – 15/Oct"), where the year is obvious. */
export const APP_DAY_MONTH_FORMAT = 'dd/MMM';
/** The weekday name on its own ("Thursday"), for day headings above a full date. */
export const APP_WEEKDAY_FORMAT = 'EEEE';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What the datepicker inputs show and accept: "14/Oct/2026" (also "14/10/2026", "14 oct 2026", "14-October-2026"). */
@Injectable()
export class AppDateParserFormatter extends NgbDateParserFormatter {
  format(date: NgbDateStruct | null): string {
    if (!date) {
      return '';
    }

    return `${String(date.day).padStart(2, '0')}/${MONTHS[date.month - 1]}/${date.year}`;
  }

  parse(value: string): NgbDateStruct | null {
    const match = /^(\d{1,2})[/\-\s]+([a-z]+|\d{1,2})[/\-\s]+(\d{4})$/i.exec(value.trim());
    if (!match) {
      return null;
    }

    const [, day, monthPart, year] = match;
    const month = /^\d+$/.test(monthPart)
      ? Number(monthPart)
      : MONTHS.findIndex((m) => monthPart.toLowerCase().startsWith(m.toLowerCase())) + 1;
    if (month < 1 || month > 12) {
      return null;
    }

    // Out-of-range days ("31/Feb") come back as a struct the datepicker itself rejects as invalid.
    return { day: Number(day), month, year: Number(year) };
  }
}

/** Form controls hold the API's DATE shape, "yyyy-MM-dd" (or null), not NgbDateStruct. */
@Injectable()
export class IsoDateAdapter extends NgbDateAdapter<string> {
  fromModel(value: string | null): NgbDateStruct | null {
    const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    return match
      ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      : null;
  }

  toModel(date: NgbDateStruct | null): string | null {
    if (!date) {
      return null;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
  }
}

export function provideAppDateFormat(): Provider[] {
  return [
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { dateFormat: APP_DATE_FORMAT } },
    { provide: NgbDateParserFormatter, useClass: AppDateParserFormatter },
    { provide: NgbDateAdapter, useClass: IsoDateAdapter },
  ];
}

/** Inline error for a datepicker control: ngbDatepicker flags text it can't parse as `ngbDate`. */
export function dateFieldError(errors: Record<string, unknown> | null): string | null {
  return errors?.['ngbDate'] ? 'Use a date like 14/Oct/2026, or pick one from the calendar.' : null;
}
