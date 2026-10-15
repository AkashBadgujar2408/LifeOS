import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HabitDayState, canToggle } from './habit-schedule';

const STATE_TEXT: Record<HabitDayState, string> = {
  done: 'done',
  open: 'not done yet',
  missed: 'missed',
  off: 'not scheduled',
  notStarted: 'before the habit started',
  future: 'still to come',
};

/**
 * One day of one habit: a round tick button on the check-off grid and the detail page's history. Only done / open
 * / missed days are clickable; the rest are drawn but inert, so the grid stays aligned.
 */
@Component({
  selector: 'app-habit-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  styleUrl: './habit-day.scss',
  template: `
    @if (clickable()) {
      <button
        type="button"
        class="habit-day habit-day-{{ state() }}"
        [class.habit-day-sm]="small()"
        [disabled]="busy()"
        [attr.aria-pressed]="state() === 'done'"
        [attr.aria-label]="habitTitle() + ', ' + (day() | date) + ': ' + stateText()"
        [title]="(day() | date) + ' · ' + stateText()"
        (click)="toggled.emit(day())"
      >
        @if (state() === 'done') {
          <i class="bi bi-check-lg" aria-hidden="true"></i>
        }
      </button>
    } @else {
      <span
        class="habit-day habit-day-{{ state() }}"
        [class.habit-day-sm]="small()"
        [title]="(day() | date) + ' · ' + stateText()"
        aria-hidden="true"
      >
        @if (state() === 'done') {
          <i class="bi bi-check-lg"></i>
        }
      </span>
    }
  `,
})
export class HabitDay {
  readonly day = input.required<string>();
  readonly state = input.required<HabitDayState>();
  readonly habitTitle = input('');
  /** Archived habits show their history but can't be ticked. */
  readonly readonly = input(false);
  readonly busy = input(false);
  /** The compact size used by the detail page's 12-week history. */
  readonly small = input(false);

  readonly toggled = output<string>();

  protected readonly clickable = computed(() => !this.readonly() && canToggle(this.state()));
  protected readonly stateText = computed(() => STATE_TEXT[this.state()]);
}
