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
import { LearningService, StudySession } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMinutes } from '../calendar/calendar-feed';
import { focusedSeconds, formatClock, sessionMinutes } from '../tasks/focus';

/** What the timer is logging time against (at least one part is needed to start). */
export interface StudySubject {
  topic: string | null;
  skillId: number | null;
  courseId: number | null;
  mediaItemId: number | null;
}

type TimerState = 'idle' | 'running' | 'paused';

/**
 * The study timer: a stopwatch (count up, pause, resume) that logs the studied minutes — pauses excluded, under a
 * minute ignored — as a study session on today's date when stopped, or when the page closes mid-session. Shares
 * the focus timer's wall-clock helpers, so a throttled background tab still counts the right time.
 */
@Component({
  selector: 'app-study-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex flex-wrap align-items-center gap-2">
      <span
        class="fs-3 fw-semibold font-monospace"
        role="timer"
        [attr.aria-label]="'Studied so far ' + clock()"
        >{{ clock() }}</span
      >
      @if (state() === 'idle') {
        <button type="button" class="btn btn-primary" [disabled]="!ready()" (click)="start()">
          <i class="bi bi-play-fill"></i> Start
        </button>
        @if (!ready()) {
          <span class="small text-body-secondary">Say what you're studying first.</span>
        }
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
export class StudyTimer {
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);

  readonly subject = input.required<StudySubject>();
  /** A session was logged. */
  readonly logged = output<StudySession>();

  protected readonly state = signal<TimerState>('idle');
  protected readonly ready = computed(() => {
    const s = this.subject();
    return !!(s.topic?.trim() || s.skillId || s.courseId || s.mediaItemId);
  });

  private banked = 0;
  private runningSince: number | null = null;
  private startedAt: Date | null = null;
  /** The subject as it was when the timer started, so editing the form mid-session can't relabel it. */
  private subjectAtStart: StudySubject | null = null;
  private readonly now = signal(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  protected readonly clock = computed(() => {
    this.now();
    return formatClock(this.state() === 'idle' ? 0 : this.focused());
  });

  constructor() {
    // Leaving the page mid-session still keeps the time.
    inject(DestroyRef).onDestroy(() => {
      if (this.state() !== 'idle') {
        this.log(true);
      }
      this.stopTicker();
    });
  }

  protected start(): void {
    this.subjectAtStart = { ...this.subject() };
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
    this.subjectAtStart = null;
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

  /** Logs the studied minutes (a minute or more) and resets; `quiet` when the page is closing. */
  private log(quiet: boolean): void {
    const minutes = sessionMinutes(this.focused());
    const startedAt = this.startedAt;
    const subject = this.subjectAtStart;
    this.reset();
    if (minutes === 0 || !startedAt || !subject) {
      if (!quiet) {
        this.toast.success('Under a minute — nothing logged.');
      }
      return;
    }
    const today = todayIso();
    this.learningService
      .saveStudySession(null, {
        studiedOn: today,
        minutes,
        topic: subject.topic?.trim() || null,
        skillId: subject.skillId,
        courseId: subject.courseId,
        mediaItemId: subject.mediaItemId,
        startedAt: startedAt.toISOString(),
        notes: null,
        today,
      })
      .subscribe({
        next: (session) => {
          if (!quiet) {
            this.logged.emit(session);
            this.toast.success(`${formatMinutes(minutes)} of study logged.`);
          }
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not log the study time.')),
      });
  }
}
