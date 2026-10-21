import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  LearningService,
  Proficiency,
  Skill,
  SkillDetail,
} from '../../core/services/learning.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { PROFICIENCY_LABELS, PROFICIENCY_LEVELS } from './learning-view';

const LEARNING_AREA_NAME = 'Learning';

/** Opens the skill dialog (new when `skill` is missing); resolves with the saved skill, or null if dismissed. */
export async function openSkillEditor(modal: NgbModal, skill?: Skill): Promise<SkillDetail | null> {
  const modalRef = modal.open(SkillEditor, { ariaLabelledBy: 'skill-editor-heading' });
  (modalRef.componentInstance as SkillEditor).configure(skill);
  try {
    return (await modalRef.result) as SkillDetail;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-skill-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TagPicker, NgOptionComponent, NgSelectComponent],
  templateUrl: './skill-editor.html',
})
export class SkillEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly levels = PROFICIENCY_LEVELS;
  protected readonly levelLabels = PROFICIENCY_LABELS;
  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });

  protected readonly skill = signal<Skill | null>(null);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    proficiency: this.fb.nonNullable.control<Proficiency>(1),
    targetProficiency: this.fb.control<Proficiency | null>(null),
    lifeAreaId: this.fb.control<number | null>(null),
    levelNote: this.fb.nonNullable.control('', Validators.maxLength(1000)),
  });

  private readonly proficiency = toSignal(this.form.controls.proficiency.valueChanges, {
    initialValue: 1 as Proficiency,
  });
  /** A new skill records where it starts; an existing one only when the level moves. */
  protected readonly levelChanging = computed(() => {
    const skill = this.skill();
    return !skill || skill.proficiency !== this.proficiency();
  });

  constructor() {
    effect(() => {
      const learning = this.lifeAreas().find((a) => a.name === LEARNING_AREA_NAME);
      untracked(() => {
        const control = this.form.controls.lifeAreaId;
        if (learning && !this.skill() && control.pristine && control.value === null) {
          control.setValue(learning.id);
        }
      });
    });
  }

  configure(skill?: Skill): void {
    this.skill.set(skill ?? null);
    this.tagIds.set(skill?.tags.map((t) => t.id) ?? []);
    this.form.reset({
      name: skill?.name ?? '',
      description: skill?.description ?? '',
      proficiency: skill?.proficiency ?? 1,
      targetProficiency: skill?.targetProficiency ?? null,
      lifeAreaId: skill ? skill.lifeAreaId : null,
      levelNote: '',
    });
  }

  protected fieldError(name: 'name' | 'description' | 'levelNote'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return 'Name the skill.';
    }
    return {
      name: 'Keep the name under 200 characters.',
      description: 'Keep the description under 2000 characters.',
      levelNote: 'Keep the note under 1000 characters.',
    }[name];
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.learningService
      .saveSkill(this.skill()?.id ?? null, {
        name: v.name,
        description: v.description.trim() || null,
        proficiency: v.proficiency,
        targetProficiency: v.targetProficiency,
        lifeAreaId: v.lifeAreaId,
        tagIds: this.tagIds(),
        today: todayIso(),
        levelNote: this.levelChanging() ? v.levelNote.trim() || null : null,
      })
      .subscribe({
        next: (saved) => this.activeModal.close(saved),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the skill.'));
        },
      });
  }
}
