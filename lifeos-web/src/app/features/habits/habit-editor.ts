import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { Habit, HabitsService } from '../../core/services/habits.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { ToastService } from '../../core/services/toast.service';
import { EVERY_DAY, WEEKDAYS, WEEKDAY_NAMES } from './habit-schedule';
import { apiErrorMessage } from '../../core/services/api-error';

/** Opens the create/edit dialog; resolves with the saved habit, or null if it was dismissed. */
export async function openHabitEditor(modal: NgbModal, habit?: Habit): Promise<Habit | null> {
  const modalRef = modal.open(HabitEditor, { ariaLabelledBy: 'habit-editor-heading' });
  (modalRef.componentInstance as HabitEditor).configure(habit);
  try {
    return (await modalRef.result) as Habit;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-habit-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  templateUrl: './habit-editor.html',
})
export class HabitEditor {
  private readonly fb = inject(FormBuilder);
  private readonly habitsService = inject(HabitsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly weekdayNames = WEEKDAY_NAMES;
  protected readonly presets = [
    { label: 'Every day', mask: EVERY_DAY },
    { label: 'Weekdays', mask: WEEKDAYS },
  ];

  protected readonly habit = signal<Habit | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    lifeAreaId: this.fb.control<number | null>(null),
    scheduleDays: this.fb.nonNullable.control(EVERY_DAY, Validators.min(1)),
    startDate: this.fb.control<string | null>(todayIso(), Validators.required),
  });

  configure(habit?: Habit): void {
    this.habit.set(habit ?? null);
    this.form.reset({
      title: habit?.title ?? '',
      description: habit?.description ?? '',
      lifeAreaId: habit?.lifeAreaId ?? null,
      scheduleDays: habit?.scheduleDays ?? EVERY_DAY,
      startDate: habit?.startDate ?? todayIso(),
    });
  }

  protected hasDay(index: number): boolean {
    return (this.form.controls.scheduleDays.value & (1 << index)) !== 0;
  }

  protected toggleDay(index: number): void {
    const control = this.form.controls.scheduleDays;
    control.setValue(control.value ^ (1 << index));
    control.markAsTouched();
  }

  protected setSchedule(mask: number): void {
    this.form.controls.scheduleDays.setValue(mask);
  }

  protected fieldError(
    name: 'title' | 'description' | 'scheduleDays' | 'startDate',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }

    switch (name) {
      case 'title':
        return control.errors['required']
          ? 'Give the habit a name.'
          : 'Keep the name under 200 characters.';
      case 'description':
        return 'Keep the description under 4000 characters.';
      case 'scheduleDays':
        return 'Pick at least one day of the week.';
      case 'startDate':
        return control.errors['required']
          ? 'Pick the day it starts counting from.'
          : dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      title: value.title,
      description: value.description.trim() || null,
      lifeAreaId: value.lifeAreaId,
      scheduleDays: value.scheduleDays,
      startDate: value.startDate!,
    };
    const habit = this.habit();
    const request = habit
      ? this.habitsService.update(habit.id, payload, todayIso())
      : this.habitsService.create(payload, todayIso());

    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the habit.'));
      },
    });
  }
}
