import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { Habit, HabitKind, HabitTemplate, HabitsService } from '../../core/services/habits.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { ToastService } from '../../core/services/toast.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { EVERY_DAY, WEEKDAYS, WEEKDAY_NAMES } from './habit-schedule';
import { apiErrorMessage } from '../../core/services/api-error';

/** A new habit started from the library: the template, plus its category's tag (already found or created). */
export interface HabitStart {
  template: HabitTemplate;
  tagIds: number[];
}

/**
 * Opens the create/edit dialog — for `habit`, or a new habit (prefilled from a library template when given);
 * resolves with the saved habit, or null if it was dismissed.
 */
export async function openHabitEditor(
  modal: NgbModal,
  habit?: Habit,
  start?: HabitStart,
): Promise<Habit | null> {
  const modalRef = modal.open(HabitEditor, { ariaLabelledBy: 'habit-editor-heading' });
  (modalRef.componentInstance as HabitEditor).configure(habit, start);
  try {
    return (await modalRef.result) as Habit;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-habit-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, TagPicker],
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

  protected readonly kinds: readonly { value: HabitKind; label: string; hint: string }[] = [
    { value: 'Build', label: 'Build a habit', hint: 'Something to do' },
    { value: 'Avoid', label: 'Break a habit', hint: 'Something to stop' },
  ];

  protected readonly habit = signal<Habit | null>(null);
  protected readonly saving = signal(false);
  protected readonly tagIds = signal<number[]>([]);
  /** A template's life area, matched by name once the areas have loaded. */
  private readonly pendingLifeArea = signal<string | null>(null);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    lifeAreaId: this.fb.control<number | null>(null),
    kind: this.fb.nonNullable.control<HabitKind>('Build'),
    measured: this.fb.nonNullable.control(false),
    targetValue: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(9999999.99),
    ]),
    unit: this.fb.nonNullable.control('', Validators.maxLength(30)),
    scheduleDays: this.fb.nonNullable.control(EVERY_DAY, Validators.min(1)),
    startDate: this.fb.control<string | null>(todayIso(), Validators.required),
  });

  constructor() {
    effect(() => {
      const name = this.pendingLifeArea();
      const area = this.lifeAreas().find((a) => a.name === name);
      if (area) {
        untracked(() => {
          this.form.controls.lifeAreaId.setValue(area.id);
          this.pendingLifeArea.set(null);
        });
      }
    });
  }

  configure(habit?: Habit, start?: HabitStart): void {
    const template = start?.template;
    this.habit.set(habit ?? null);
    this.tagIds.set(habit?.tags.map((t) => t.id) ?? start?.tagIds ?? []);
    this.pendingLifeArea.set(template?.lifeAreaName ?? null);
    const targetValue = habit?.targetValue ?? template?.targetValue ?? null;
    this.form.reset({
      title: habit?.title ?? template?.title ?? '',
      description: habit?.description ?? template?.description ?? '',
      lifeAreaId: habit?.lifeAreaId ?? null,
      kind: habit?.kind ?? template?.kind ?? 'Build',
      measured: targetValue !== null,
      targetValue,
      unit: habit?.unit ?? template?.unit ?? '',
      scheduleDays: habit?.scheduleDays ?? template?.scheduleDays ?? EVERY_DAY,
      startDate: habit?.startDate ?? todayIso(),
    });
  }

  protected setKind(kind: HabitKind): void {
    this.form.controls.kind.setValue(kind);
    if (kind === 'Avoid') {
      this.form.controls.measured.setValue(false);
    }
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
    name: 'title' | 'description' | 'scheduleDays' | 'startDate' | 'targetValue' | 'unit',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }

    switch (name) {
      case 'targetValue':
        return control.errors['required']
          ? 'Say how much a day needs, e.g. 20.'
          : 'The target must be between 0.01 and 9,999,999.99.';
      case 'unit':
        return 'Keep the unit under 30 characters.';
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
    const measuring =
      this.form.controls.kind.value === 'Build' && this.form.controls.measured.value;
    const target = this.form.controls.targetValue;
    target.setValidators(
      measuring
        ? [Validators.required, Validators.min(0.01), Validators.max(9999999.99)]
        : [Validators.min(0.01), Validators.max(9999999.99)],
    );
    target.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const avoid = value.kind === 'Avoid';
    const payload = {
      title: value.title,
      description: value.description.trim() || null,
      lifeAreaId: value.lifeAreaId,
      // An avoid habit runs every day (the API insists on it too).
      scheduleDays: avoid ? EVERY_DAY : value.scheduleDays,
      startDate: value.startDate!,
      kind: value.kind,
      targetValue: measuring ? value.targetValue : null,
      unit: measuring ? value.unit.trim() || null : null,
      tagIds: this.tagIds(),
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
