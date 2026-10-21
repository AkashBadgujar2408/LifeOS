import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { HobbySession, LeisureService } from '../../core/services/leisure.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMinutes } from '../calendar/calendar-feed';
import { focusedSeconds, formatClock, sessionMinutes } from '../tasks/focus';

type TimerState = 'idle' | 'running' | 'paused';

/**
 * The practice timer (Session 78b, like the study timer): count up, pause, resume; stopping logs the minutes —
 * pauses excluded, under a minute ignored — as a practice session today, and so does leaving the page mid-session.
 * Wall-clock helpers shared with the focus timer, so a throttled background tab still counts the right time.
 */
@Component({
  selector: 'app-practice-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex flex-wrap align-items-center gap-2">
      <span
        class="fs-3 fw-semibold font-monospace"
        role="timer"
        [attr.aria-label]="'Practised so far ' + clock()"
        >{{ clock() }}</span
      >
      @if (state() === 'idle') {
        <button type="button" class="btn btn-primary" (click)="start()">
          <i class="bi bi-play-fill"></i> Start practising
        </button>
      } @else {
        @if (state() === 'running') {
          <button type="button" class="btn btn-outline-secondary" (click)="pause()">
            <i class="bi bi-pause-fill"></i> Pause
          </button>
        } @else {
          <button type="button" class="btn btn-outline-primary" (click)="resume()">
            <i class="bi bi-play-fill"></i> Resume
          </button>
        }
        <button type="button" class="btn btn-primary" (click)="stop()">
          <i class="bi bi-stop-fill"></i> Stop and log
        </button>
        <button type="button" class="btn btn-link text-body-secondary" (click)="reset()">
          Discard
        </button>
      }
    </div>
  `,
})
export class PracticeTimer {
  private readonly leisureService = inject(LeisureService);
  private readonly toast = inject(ToastService);

  readonly hobbyId = input.required<number>();
  /** A session was logged. */
  readonly logged = output<HobbySession>();

  protected readonly state = signal<TimerState>('idle');

  private banked = 0;
  private runningSince: number | null = null;
  private startedAt: Date | null = null;
  /** The hobby as it was when the timer started. */
  private hobbyAtStart: number | null = null;
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  protected readonly clock = computed(() => {
    this.now();
    return formatClock(this.state() === 'idle' ? 0 : this.focused());
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.state() !== 'idle') {
        this.log(true);
      }
      this.stopTicker();
    });
  }

  protected start(): void {
    this.hobbyAtStart = this.hobbyId();
    this.banked = 0;
    this.startedAt = new Date();
    this.runningSince = Date.now();
    this.state.set('running');
    this.stopTicker();
    this.ticker = setInterval(() => this.now.set(Date.now()), 1000);
  }

  protected pause(): void {
    this.banked = this.focused();
    this.runningSince = null;
    this.state.set('paused');
  }

  protected resume(): void {
    this.runningSince = Date.now();
    this.state.set('running');
  }

  protected stop(): void {
    this.log(false);
  }

  protected reset(): void {
    this.stopTicker();
    this.banked = 0;
    this.runningSince = null;
    this.startedAt = null;
    this.hobbyAtStart = null;
    this.state.set('idle');
  }

  private focused(): number {
    return focusedSeconds(this.banked, this.runningSince, Date.now());
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** Logs the practised minutes (a minute or more) and resets; `quiet` when the page is closing. */
  private log(quiet: boolean): void {
    const minutes = sessionMinutes(this.focused());
    const startedAt = this.startedAt;
    const hobbyId = this.hobbyAtStart;
    this.reset();
    if (minutes === 0 || !startedAt || hobbyId === null) {
      if (!quiet) {
        this.toast.success('Under a minute — nothing logged.');
      }
      return;
    }
    const today = todayIso();
    this.leisureService
      .addSession(hobbyId, {
        practicedOn: today,
        minutes,
        startedAt: startedAt.toISOString(),
        note: null,
        today,
      })
      .subscribe({
        next: (session) => {
          if (!quiet) {
            this.logged.emit(session);
            this.toast.success(`${formatMinutes(minutes)} of practice logged.`);
          }
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not log the practice.')),
      });
  }
}
