import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error';
import { GoalStatus, Mission, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { MISSION_KIND_META } from './missions-view';

const STATUS_WORDS: Partial<Record<GoalStatus, string>> = {
  Completed: 'passed',
  Postponed: 'on hold',
  Abandoned: 'let go',
};

/**
 * A goal's place in Story Mode, for the goal page: its mission kind, what it needs first (add/remove), what it
 * unlocks, and a gentle "locked" note while a prerequisite is still in play. Locks are advisory — nothing is blocked.
 * Re-reads itself when the goal's status changes (pass `status`).
 */
@Component({
  selector: 'app-mission-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    @if (mission(); as m) {
      <div class="d-flex align-items-center justify-content-between mb-2">
        <h2 class="h6 mb-0">
          <i class="bi {{ kindMeta[m.kind].icon }} text-primary" aria-hidden="true"></i>
          {{ kindMeta[m.kind].label }}
        </h2>
        <a routerLink="/missions" class="small">All missions</a>
      </div>

      @if (m.isLocked) {
        <p class="small mb-3 mission-locked">
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
          Locked until {{ joinTitles(m.blockedBy) }} {{ m.blockedBy.length === 1 ? 'is' : 'are' }}
          done — you can still work on it.
        </p>
      }

      <div class="small text-body-secondary mb-1">Needs first</div>
      @if (m.prerequisites.length === 0) {
        <p class="small text-body-secondary mb-2">Nothing — it's open.</p>
      } @else {
        <ul class="list-unstyled mb-2 d-flex flex-column gap-1">
          @for (p of m.prerequisites; track p.id) {
            <li class="d-flex align-items-center gap-2">
              <a [routerLink]="['/goals', p.id]" class="text-truncate min-w-0">{{ p.title }}</a>
              @if (statusWords[p.status]; as word) {
                <span class="badge text-bg-light border fw-normal">{{ word }}</span>
              }
              <button
                type="button"
                class="btn btn-sm btn-link text-body-secondary p-0 ms-auto"
                [attr.aria-label]="'Stop needing ' + p.title"
                [disabled]="busy()"
                (click)="remove(p.id)"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </li>
          }
        </ul>
      }

      @if (options().length > 0) {
        <label class="visually-hidden" for="mission-prerequisite"
          >Add a mission that has to come first</label
        >
        <ng-select
          labelForId="mission-prerequisite"
          class="ng-select-sm mb-3"
          #prerequisitePicker
          [disabled]="busy()"
          [ngModel]="null"
          (ngModelChange)="add($event); $event !== null && prerequisitePicker.clearModel()"
          placeholder="+ Needs another mission first…"
        >
          @for (o of options(); track o.id) {
            <ng-option [value]="o.id">
              {{ o.title }}{{ statusWords[o.status] ? ' (' + statusWords[o.status] + ')' : '' }}
            </ng-option>
          }
        </ng-select>
      }

      <div class="small text-body-secondary mb-1">Unlocks</div>
      @if (m.unlocks.length === 0) {
        <p class="small text-body-secondary mb-0">No mission waits on this one yet.</p>
      } @else {
        <ul class="list-unstyled mb-0 d-flex flex-column gap-1">
          @for (u of m.unlocks; track u.id) {
            <li>
              <a [routerLink]="['/goals', u.id]">{{ u.title }}</a>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="small text-body-secondary mb-0">Loading the mission…</p>
    }
  `,
  styles: `
    .mission-locked {
      color: var(--lifeos-amber);
    }
  `,
})
export class MissionLinks {
  private readonly storyService = inject(StoryService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly goalId = input.required<number>();
  /** The goal's status, so a completion (or reopening) re-reads locks and unlocks. */
  readonly status = input<string>();

  protected readonly kindMeta = MISSION_KIND_META;
  protected readonly statusWords = STATUS_WORDS;
  protected readonly mission = signal<Mission | null>(null);
  private readonly all = signal<Mission[]>([]);
  protected readonly busy = signal(false);

  /** Missions this one could need: not itself, not already a prerequisite, not something it unlocks directly. */
  protected readonly options = computed(() => {
    const m = this.mission();
    if (!m) {
      return [];
    }
    const taken = new Set([
      m.id,
      ...m.prerequisites.map((p) => p.id),
      ...m.unlocks.map((u) => u.id),
    ]);
    return this.all()
      .filter((o) => !taken.has(o.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  constructor() {
    effect(() => {
      const id = this.goalId();
      this.status();
      untracked(() => this.load(id));
    });
  }

  protected joinTitles(refs: { title: string }[]): string {
    const titles = refs.map((r) => `"${r.title}"`);
    return titles.length <= 1
      ? (titles[0] ?? '')
      : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
  }

  protected add(requiresGoalId: number | null): void {
    if (!requiresGoalId) {
      return;
    }
    this.busy.set(true);
    this.storyService
      .addPrerequisite(this.goalId(), requiresGoalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mission) => {
          this.mission.set(mission);
          this.busy.set(false);
        },
        error: (err) => {
          this.busy.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not add that mission.'));
        },
      });
  }

  protected remove(requiresGoalId: number): void {
    this.busy.set(true);
    this.storyService
      .removePrerequisite(this.goalId(), requiresGoalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mission) => {
          this.mission.set(mission);
          this.busy.set(false);
        },
        error: (err) => {
          this.busy.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not remove it.'));
        },
      });
  }

  private load(goalId: number): void {
    forkJoin({ mission: this.storyService.mission(goalId), all: this.storyService.missions() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ mission, all }) => {
          this.mission.set(mission);
          this.all.set(all);
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load the mission.')),
      });
  }
}
