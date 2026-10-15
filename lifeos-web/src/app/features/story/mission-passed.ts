import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  MissionPassed as MissionPassedData,
  StoryService,
} from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';
import { MISSION_KIND_META, daysTaken, daysTakenLabel } from './missions-view';

/**
 * The "Mission passed" screen: shown after a goal is completed (and from the Missions page to write or revise a
 * debrief). Celebrates what was done, says what it unlocked, and asks the two debrief prompts — both optional.
 * Resolves true when a debrief was saved or cleared, false/null otherwise.
 */
export async function openMissionPassed(modal: NgbModal, goalId: number): Promise<boolean> {
  const modalRef = modal.open(MissionPassed, {
    ariaLabelledBy: 'mission-passed-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as MissionPassed).load(goalId);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-mission-passed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './mission-passed.html',
  styleUrl: './mission-passed.scss',
})
export class MissionPassed {
  private readonly fb = inject(FormBuilder);
  private readonly storyService = inject(StoryService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly data = signal<MissionPassedData | null>(null);
  protected readonly saving = signal(false);
  protected readonly kindMeta = MISSION_KIND_META;

  protected readonly form = this.fb.nonNullable.group({
    howItWent: ['', Validators.maxLength(4000)],
    adviceToPastSelf: ['', Validators.maxLength(4000)],
  });

  protected readonly took = computed(() => {
    const mission = this.data()?.mission;
    return mission?.completedAt
      ? daysTakenLabel(daysTaken(mission.createdAt, mission.completedAt))
      : null;
  });

  protected readonly objectivesDone = computed(
    () => this.data()?.mission.objectives.filter((o) => o.done).length ?? 0,
  );

  load(goalId: number): void {
    this.storyService.passed(goalId).subscribe({
      next: (data) => {
        this.data.set(data);
        this.form.reset({
          howItWent: data.debrief?.howItWent ?? '',
          adviceToPastSelf: data.debrief?.adviceToPastSelf ?? '',
        });
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Could not open the mission.'));
        this.activeModal.dismiss();
      },
    });
  }

  protected fieldError(name: 'howItWent' | 'adviceToPastSelf'): string | null {
    const control = this.form.controls[name];
    return control.touched && control.errors?.['maxlength']
      ? 'Keep it under 4000 characters.'
      : null;
  }

  protected save(): void {
    const data = this.data();
    if (!data || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const had = data.debrief !== null;
    const payload = {
      howItWent: value.howItWent.trim() || null,
      adviceToPastSelf: value.adviceToPastSelf.trim() || null,
    };
    if (!had && !payload.howItWent && !payload.adviceToPastSelf) {
      // Nothing written and nothing to clear: the same as "Not now".
      this.activeModal.close(false);
      return;
    }

    this.saving.set(true);
    this.storyService.saveDebrief(data.mission.id, payload).subscribe({
      next: (saved) => {
        this.toast.success(saved ? 'Debrief saved to your story.' : 'Debrief removed.');
        this.activeModal.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the debrief.'));
      },
    });
  }
}
