import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { apiErrorMessage } from '../../core/services/api-error';
import { FocusSession, TaskItem, TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMinutes } from '../calendar/calendar-feed';
import {
  FOCUS_LENGTHS,
  focusedSeconds,
  formatClock,
  sessionMinutes,
  timeVersusEstimate,
} from './focus';

type TimerState = 'idle' | 'running' | 'paused';

/**
 * The task editor's focus (Pomodoro) timer: pick 15 / 25 / 50 minutes, start, pause, stop. When the time is up — or
 * on Stop, or if the editor closes mid-session — the focused minutes (pauses excluded) are logged as a focus session,
 * which adds to the task's actual time. The task's estimated vs actual sits above it.
 */
@Component({
  selector: 'app-focus-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <span class="small fw-semibold text-body-secondary"
        ><i class="bi bi-stopwatch"></i> Focus</span
      >
      @if (versus(); as text) {
        <span class="small" [class.text-warning-emphasis]="overEstimate()">{{ text }}</span>
      }
    </div>

    <div class="d-flex flex-wrap align-items-center gap-2">
      <span
        class="fs-4 fw-semibold font-monospace"
        role="timer"
        [attr.aria-label]="'Focus time left ' + clock()"
        >{{ clock() }}</span
      >
      @if (state() === 'idle') {
        <div class="btn-group btn-group-sm" role="group" aria-label="Session length">
          @for (length of lengths; track length) {
            <button
              type="button"
              class="btn"
              [class.btn-primary]="minutes() === length"
              [class.btn-outline-secondary]="minutes() !== length"
              [attr.aria-pressed]="minutes() === length"
              (click)="minutes.set(length)"
            >
              {{ length }}m
            </button>
          }
        </div>
        <button type="button" class="btn btn-sm btn-primary" (click)="start()">
          <i class="bi bi-play-fill"></i> Start
        </button>
      } @else {
        @if (state() === 'running') {
          <button type="button" class="btn btn-sm btn-outline-secondary" (click)="pause()">
            <i class="bi bi-pause-fill"></i> Pause
          </button>
        } @else {
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="resume()">
            <i class="bi bi-play-fill"></i> Resume
          </button>
        }
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="stop()">
          <i class="bi bi-stop-fill"></i> Stop and log
        </button>
        <button type="button" class="btn btn-sm btn-link text-body-secondary" (click)="discard()">
          Discard
        </button>
      }
    </div>

    @if (sessions().length > 0) {
      <ul class="list-unstyled small mb-0 mt-2 d-flex flex-column gap-1">
        @for (s of sessions().slice(0, 5); track s.id) {
          <li class="d-flex gap-2 align-items-center text-body-secondary">
            <span class="flex-grow-1">{{ s.startedAt | date: dateTimeFormat }}</span>
            <span>{{ format(s.minutes) }}</span>
            <button
              type="button"
              class="btn btn-link btn-sm p-0 text-body-secondary"
              [attr.aria-label]="'Remove the ' + s.minutes + '-minute session'"
              (click)="removeSession(s)"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class FocusTimer {
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);

  readonly task = input.required<TaskItem>();
  /** The task after a session was logged or removed (new actual time). */
  readonly changed = output<TaskItem>();

  protected readonly lengths = FOCUS_LENGTHS;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly format = formatMinutes;
  protected readonly minutes = signal<number>(25);
  protected readonly state = signal<TimerState>('idle');
  protected readonly sessions = signal<FocusSession[]>([]);

  private banked = 0;
  private runningSince: number | null = null;
  private startedAt: Date | null = null;
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  protected readonly clock = computed(() => {
    this.now();
    const left = this.minutes() * 60 - this.focused();
    return formatClock(this.state() === 'idle' ? this.minutes() * 60 : left);
  });
  protected readonly versus = computed(() =>
    timeVersusEstimate(this.task().actualMinutes, this.task().estimateMinutes, formatMinutes),
  );
  protected readonly overEstimate = computed(() => {
    const t = this.task();
    return t.estimateMinutes !== null && t.actualMinutes > t.estimateMinutes;
  });

  constructor() {
    effect(() => {
      const id = this.task().id;
      untracked(() => this.loadSessions(id));
    });
    // Closing the editor mid-session still keeps the focus time.
    inject(DestroyRef).onDestroy(() => {
      if (this.state() !== 'idle') {
        this.log(true);
      }
      this.stopTicker();
    });
  }

  protected start(): void {
    this.banked = 0;
    this.startedAt = new Date();
    this.runningSince = Date.now();
    this.state.set('running');
    this.startTicker();
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

  protected discard(): void {
    this.reset();
  }

  protected removeSession(session: FocusSession): void {
    this.tasksService.removeFocusSession(this.task().id, session.id).subscribe({
      next: (task) => {
        this.sessions.update((list) => list.filter((s) => s.id !== session.id));
        this.changed.emit(task);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the session.')),
    });
  }

  private focused(): number {
    return focusedSeconds(this.banked, this.runningSince, Date.now());
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => {
      this.now.set(Date.now());
      if (this.state() === 'running' && this.focused() >= this.minutes() * 60) {
        this.log(false, true);
      }
    }, 1000);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** Logs the focused minutes (if a minute or more) and resets; `quiet` when the editor is closing. */
  private log(quiet: boolean, finished = false): void {
    const minutes = sessionMinutes(this.focused());
    const startedAt = this.startedAt;
    const taskId = this.task().id;
    this.reset();
    if (minutes === 0 || !startedAt) {
      if (!quiet) {
        this.toast.success('Under a minute — nothing logged.');
      }
      return;
    }
    this.tasksService
      .addFocusSession(taskId, {
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        minutes,
      })
      .subscribe({
        next: (task) => {
          if (quiet) {
            return;
          }
          this.changed.emit(task);
          this.loadSessions(taskId);
          this.toast.success(
            finished
              ? `Time's up — ${formatMinutes(minutes)} of focus logged. Take a short break.`
              : `${formatMinutes(minutes)} of focus logged.`,
          );
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not log the focus time.')),
      });
  }

  private reset(): void {
    this.stopTicker();
    this.banked = 0;
    this.runningSince = null;
    this.startedAt = null;
    this.state.set('idle');
  }

  private loadSessions(taskId: number): void {
    this.tasksService.focusSessions(taskId).subscribe({
      next: (sessions) => this.sessions.set(sessions),
      error: () => this.sessions.set([]),
    });
  }
}
