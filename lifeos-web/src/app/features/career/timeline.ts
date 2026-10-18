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
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import {
  CareerAchievement,
  CareerService,
  Employment,
  SalaryRecord,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { chapterLength } from '../story/story-view';
import { openAchievementEditor } from './achievement-editor';
import {
  ACHIEVEMENT_KIND_ICONS,
  EMPLOYMENT_TYPE_LABELS,
  currentRoles,
  formatPay,
  stints,
} from './career-view';
import { openPromotionDialog } from './promotion-dialog';
import { openRoleEditor } from './role-editor';

/**
 * The career timeline: where you are now (role, how long, current pay) and every stint before it, newest first —
 * consecutive roles at one organisation grouped, each with the achievements recorded in it.
 */
@Component({
  selector: 'app-career-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  templateUrl: './timeline.html',
})
export class CareerTimeline {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  protected readonly kindIcons = ACHIEVEMENT_KIND_ICONS;
  protected readonly formatPay = formatPay;
  protected readonly today = signal(todayIso());
  protected readonly roles = signal<Employment[] | null>(null);
  protected readonly achievements = signal<CareerAchievement[]>([]);
  protected readonly salary = signal<SalaryRecord[]>([]);
  protected readonly loadFailed = signal(false);

  protected readonly stints = computed(() => stints(this.roles() ?? []));
  protected readonly current = computed(() => currentRoles(this.roles() ?? []));
  /** Achievements by role, newest first (they arrive sorted). */
  protected readonly achievementsByRole = computed(() => {
    const byRole = new Map<number, CareerAchievement[]>();
    for (const a of this.achievements()) {
      if (a.employmentId !== null) {
        byRole.set(a.employmentId, [...(byRole.get(a.employmentId) ?? []), a]);
      }
    }
    return byRole;
  });
  protected readonly outsideRoles = computed(() =>
    this.achievements().filter((a) => a.employmentId === null),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.today.set(todayIso());
    forkJoin({
      roles: this.careerService.employments(),
      achievements: this.careerService.achievements(),
      salary: this.careerService.salaryRecords(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, achievements, salary }) => {
          this.roles.set(roles);
          this.achievements.set(achievements);
          this.salary.set(salary);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected length(start: string, end: string | null): string {
    return chapterLength(start, end, this.today());
  }

  /** The latest pay recorded for a role (records arrive newest first). */
  protected payFor(role: Employment): SalaryRecord | undefined {
    return this.salary().find((s) => s.employmentId === role.id);
  }

  protected async editRole(role?: Employment): Promise<void> {
    const result = await openRoleEditor(this.modal, role);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Role saved.' : 'Role deleted.');
      this.load();
    }
  }

  protected async promote(role: Employment): Promise<void> {
    const result = await openPromotionDialog(
      this.modal,
      role,
      this.payFor(role)?.currency ?? this.salary()[0]?.currency ?? null,
    );
    if (result) {
      this.toast.success(`Congratulations, ${result.newRole.role}!`);
      this.load();
    }
  }

  protected async editAchievement(
    achievement?: CareerAchievement,
    role?: Employment,
  ): Promise<void> {
    const result = await openAchievementEditor(this.modal, achievement, role?.id);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Achievement saved.' : 'Achievement deleted.');
      this.load();
    }
  }
}
