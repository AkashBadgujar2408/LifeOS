import Swal from 'sweetalert2';
import { formatDate } from '@angular/common';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import { Habit } from '../../core/services/habits.service';
import { formatAmount } from './habit-schedule';

/** What a click on a day asks the API to do; null when the user cancelled. */
export interface EntryChange {
  done: boolean;
  value: number | null;
}

/**
 * Works out a click on one day of a habit: a plain or avoid habit toggles (done / slipped), a measurable one asks how
 * much was done — prefilled with what's logged, or the target — and a blank answer clears the day.
 */
export async function entryChangeFor(habit: Habit, day: string): Promise<EntryChange | null> {
  if (habit.kind === 'Avoid') {
    return { done: !habit.slipDates.includes(day), value: null };
  }
  if (habit.targetValue === null) {
    return { done: !habit.doneDates.includes(day), value: null };
  }

  const logged = habit.values[day];
  const unit = habit.unit ? ` (${habit.unit})` : '';
  const answer = await Swal.fire({
    title: habit.title,
    text: `${formatDate(day, APP_DATE_FORMAT, 'en-US')} — target ${formatAmount(habit.targetValue)}${unit}. Leave it blank to clear the day.`,
    input: 'number',
    inputValue: String(logged ?? habit.targetValue),
    inputAttributes: { min: '0', step: 'any', 'aria-label': `How much${unit}` },
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: 'var(--lifeos-teal)',
    inputValidator: (raw) => {
      if (raw === '') {
        return null;
      }
      const amount = Number(raw);
      return Number.isFinite(amount) && amount >= 0 && amount <= 9999999.99
        ? null
        : 'Enter an amount from 0 up.';
    },
  });
  if (!answer.isConfirmed) {
    return null;
  }
  const raw = String(answer.value ?? '');
  return raw === '' || Number(raw) === 0
    ? { done: false, value: null }
    : { done: true, value: Number(raw) };
}
