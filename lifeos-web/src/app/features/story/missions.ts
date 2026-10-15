import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../core/services/api-error';
import { Mission, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openMissionPassed } from './mission-passed';
import {
  MISSION_KINDS,
  MISSION_KIND_META,
  daysTaken,
  daysTakenLabel,
  inPlayByKind,
  nextObjective,
  passedMissions,
} from './missions-view';

type View = 'inPlay' | 'passed';

/**
 * Your goals as missions: main (long-term), side (short-term) and collectibles (bucket list), with their objectives
 * and what each is waiting on. Passed missions keep their debrief. Missions are goals — create and edit them on the
 * Goals pages; this is the game-shaped view of the same data.
 */
@Component({
  selector: 'app-missions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './missions.html',
  styleUrl: './missions.scss',
})
export class Missions {
  private readonly storyService = inject(StoryService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kinds = MISSION_KINDS;
  protected readonly kindMeta = MISSION_KIND_META;
  protected readonly nextObjective = nextObjective;

  protected readonly missions = signal<Mission[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly view = signal<View>('inPlay');

  protected readonly inPlay = computed(() => inPlayByKind(this.missions() ?? []));
  protected readonly passed = computed(() => passedMissions(this.missions() ?? []));
  protected readonly inPlayCount = computed(() =>
    this.kinds.reduce((n, k) => n + this.inPlay()[k].length, 0),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.storyService
      .missions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (missions) => {
          this.missions.set(missions);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your missions.'));
        },
      });
  }

  protected took(mission: Mission): string | null {
    return mission.completedAt
      ? daysTakenLabel(daysTaken(mission.createdAt, mission.completedAt))
      : null;
  }

  protected async debrief(mission: Mission): Promise<void> {
    if (await openMissionPassed(this.modal, mission.id)) {
      this.load();
    }
  }
}
