import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HabitDayState, canToggle } from './habit-schedule';

const STATE_TEXT: Record<HabitDayState, string> = {
  done: 'done',
  partial: 'some done, short of the target',
  open: 'not done yet',
  missed: 'missed',
  off: 'not scheduled',
  notStarted: 'before the habit started',
  future: 'still to come',
  clean: 'clean',
  slipped: 'slipped',
};

/**
 * One day of one habit: a round tick button on the check-off grid and the detail page's history. Only done / open
 * / missed days are clickable; the rest are drawn but inert, so the grid stays aligned.
 */
@Component({
  selector: 'app-habit-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet],
  styleUrl: './habit-day.scss',
  template: `
    @if (clickable()) {
      <button
        type="button"
        class="habit-day habit-day-{{ state() }}"
        [class.habit-day-sm]="small()"
        [disabled]="busy()"
        [attr.aria-pressed]="state() === 'done' || state() === 'slipped'"
        [attr.aria-label]="habitTitle() + ', ' + (day() | date) + ': ' + stateText()"
        [title]="(day() | date) + ' · ' + stateText()"
        (click)="toggled.emit(day())"
      >
        <ng-container *ngTemplateOutlet="mark" />
      </button>
    } @else {
      <span
        class="habit-day habit-day-{{ state() }}"
        [class.habit-day-sm]="small()"
        [title]="(day() | date) + ' · ' + stateText()"
        aria-hidden="true"
      >
        <ng-container *ngTemplateOutlet="mark" />
      </span>
    }
    <ng-template #mark>
      @if (amount() && !small()) {
        <span class="habit-day-amount" aria-hidden="true">{{ amount() }}</span>
      } @else if (state() === 'done') {
        <i class="bi bi-check-lg" aria-hidden="true"></i>
      } @else if (state() === 'slipped') {
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      }
    </ng-template>
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
  /** A measurable day's logged amount ("20"), shown inside the circle; included in the label. */
  readonly amount = input<string | null>(null);

  readonly toggled = output<string>();

  protected readonly clickable = computed(() => !this.readonly() && canToggle(this.state()));
  protected readonly stateText = computed(() =>
    this.amount()
      ? `${this.amount()} logged, ${STATE_TEXT[this.state()]}`
      : STATE_TEXT[this.state()],
  );
}
