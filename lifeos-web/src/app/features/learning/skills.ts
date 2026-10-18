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
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { LearningService, Skill } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { PROFICIENCY_LABELS, targetText } from './learning-view';
import { openSkillEditor } from './skill-editor';
import { SkillLevel } from './skill-level';

/** The skills inventory: strongest first, each with its level, target and what's feeding it. */
@Component({
  selector: 'app-skills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, SkillLevel],
  templateUrl: './skills.html',
})
export class Skills {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly levelLabels = PROFICIENCY_LABELS;
  protected readonly targetText = targetText;
  protected readonly skills = signal<Skill[] | null>(null);
  protected readonly loadFailed = signal(false);
  /** Tags across the inventory, for the filter chips. */
  protected readonly tags = computed(() => {
    const byId = new Map((this.skills() ?? []).flatMap((s) => s.tags).map((t) => [t.id, t]));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly tagFilter = signal<number | null>(null);
  protected readonly shown = computed(() => {
    const tag = this.tagFilter();
    const skills = this.skills() ?? [];
    return tag === null ? skills : skills.filter((s) => s.tags.some((t) => t.id === tag));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.learningService
      .skills()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (skills) => {
          this.skills.set(skills);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async add(): Promise<void> {
    const saved = await openSkillEditor(this.modal);
    if (saved) {
      this.toast.success('Skill added.');
      void this.router.navigate(['/learning/skills', saved.id]);
    }
  }
}
