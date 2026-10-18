import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  BOOK_STATUSES,
  BookStatus,
  COURSE_STATUSES,
  CourseStatus,
  KnowledgeNote,
  LearningItem,
  LearningService,
  SKILL_ENTITY_TYPE,
  SkillDetail as SkillDetailModel,
} from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openCourseEditor } from './course-editor';
import {
  BOOK_STATUS_LABELS,
  COURSE_STATUS_LABELS,
  PROFICIENCY_LABELS,
  levelChangeText,
  targetText,
} from './learning-view';
import { openNoteEditor } from './note-editor';
import { openSkillEditor } from './skill-editor';
import { SkillLevel } from './skill-level';

/** One skill: its level and target, how it got there (the level history), and the courses and books feeding it. */
@Component({
  selector: 'app-skill-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LinkedItems, EntityReminders, LoadError, SkillLevel],
  templateUrl: './skill-detail.html',
})
export class SkillDetail {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly skillEntityType = SKILL_ENTITY_TYPE;
  protected readonly levelLabels = PROFICIENCY_LABELS;
  protected readonly levelChangeText = levelChangeText;
  protected readonly targetText = targetText;

  protected readonly skill = signal<SkillDetailModel | null>(null);
  protected readonly loadFailed = signal(false);
  /** Knowledge notes about this skill, newest change first. */
  protected readonly notes = signal<KnowledgeNote[]>([]);
  private readonly titled = itemTitle(() => this.skill()?.name);

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.learningService
      .skill(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (skill) => {
          this.skill.set(skill);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
    this.loadNotes();
  }

  private loadNotes(): void {
    this.learningService
      .knowledgeNotes(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      // A side list: if it can't load, the card just says nothing's there yet.
      .subscribe({ next: (notes) => this.notes.set(notes), error: () => this.notes.set([]) });
  }

  protected async openNote(note?: KnowledgeNote): Promise<void> {
    const result = await openNoteEditor(this.modal, note, Number(this.id()));
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Note saved.' : 'Note deleted.');
      this.loadNotes();
    }
  }

  protected tagNames(note: KnowledgeNote): string {
    return note.tags.map((t) => t.name).join(', ');
  }

  protected courseStatus(item: LearningItem): string {
    return COURSE_STATUSES.includes(item.status as CourseStatus)
      ? COURSE_STATUS_LABELS[item.status as CourseStatus]
      : item.status;
  }

  protected bookStatus(item: LearningItem): string {
    return BOOK_STATUSES.includes(item.status as BookStatus)
      ? BOOK_STATUS_LABELS[item.status as BookStatus]
      : item.status;
  }

  protected async edit(skill: SkillDetailModel): Promise<void> {
    const saved = await openSkillEditor(this.modal, skill);
    if (saved) {
      this.skill.set(saved);
      this.toast.success('Skill saved.');
    }
  }

  protected openCourse(item: LearningItem): void {
    this.learningService.course(item.id).subscribe({
      next: async (course) => {
        const result = await openCourseEditor(this.modal, course);
        if (result) {
          this.toast.success(result.kind === 'saved' ? 'Course saved.' : 'Course deleted.');
          this.load();
        }
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the course.')),
    });
  }

  protected async addCourse(skill: SkillDetailModel): Promise<void> {
    const result = await openCourseEditor(this.modal, undefined, { skillId: skill.id });
    if (result) {
      this.toast.success('Course saved.');
      this.load();
    }
  }

  protected async remove(skill: SkillDetailModel): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete "${skill.name}"?`,
      text: 'Its level history goes with it. Courses and books for it stay, without a skill.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.learningService.removeSkill(skill.id).subscribe({
      next: () => {
        this.toast.success('Skill deleted.');
        void this.router.navigate(['/learning/skills']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the skill.')),
    });
  }
}
