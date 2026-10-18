import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../core/services/toast.service';
import {
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  GoalPayload,
  GoalType,
  GoalsService,
} from '../../core/services/goals.service';
import { LifeArea, LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { pickableLifeAreas } from '../../core/settings/visibility';
import { dateFieldError } from '../../core/dates/date-format';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';
import { apiErrorMessage } from '../../core/services/api-error';
import { itemTitle } from '../../core/layout/item-title';

const GOAL_TYPE_HINTS: Record<GoalType, string> = {
  ShortTerm: 'Weeks to a few months',
  LongTerm: 'A year or more',
  BucketList: 'Someday, no rush',
};

/** Create (/goals/new) and edit (/goals/:id/edit) share this form; `id` comes from the route. */
@Component({
  selector: 'app-goal-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgbInputDatepicker, TagPicker],
  templateUrl: './goal-form.html',
})
export class GoalForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly goalsService = inject(GoalsService);
  private readonly lifeAreasService = inject(LifeAreasService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>();

  protected readonly goalTypes = GOAL_TYPES;
  protected readonly typeLabels = GOAL_TYPE_LABELS;
  protected readonly typeHints = GOAL_TYPE_HINTS;

  private readonly settingsService = inject(SettingsService);
  protected readonly hiddenAreaIds = this.settingsService.hiddenLifeAreaIds;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = signal<LifeArea[]>([]);
  protected readonly tagIds = signal<number[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  /** The goal being revised, for the tab title ("Revise Visit Japan | LifeOS"). */
  private readonly revisedTitle = signal<string | null>(null);
  private readonly titled = itemTitle(() => {
    const title = this.revisedTitle();
    return title ? `Revise ${title}` : null;
  });

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    lifeAreaId: this.fb.control<number | null>(null, Validators.required),
    goalType: this.fb.nonNullable.control<GoalType>('ShortTerm'),
    targetDate: this.fb.control<string | null>(null),
    targetAmount: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    targetCurrency: this.fb.nonNullable.control(''),
    description: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    revisionNote: this.fb.nonNullable.control('', Validators.maxLength(1000)),
  });

  private baseCurrency(): string {
    return this.settingsService.settings()?.baseCurrency ?? '';
  }

  protected get isEdit(): boolean {
    return !!this.id();
  }

  ngOnInit(): void {
    this.lifeAreasService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (areas) => this.lifeAreas.set(areas),
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load life areas.')),
      });

    const id = this.id();
    if (id) {
      this.loading.set(true);
      this.goalsService
        .get(Number(id))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (goal) => {
            this.form.setValue({
              title: goal.title,
              lifeAreaId: goal.lifeAreaId,
              goalType: goal.goalType,
              targetDate: goal.targetDate,
              targetAmount: goal.targetAmount,
              targetCurrency: goal.targetCurrency ?? this.baseCurrency(),
              description: goal.description ?? '',
              revisionNote: '',
            });
            this.tagIds.set(goal.tags.map((t) => t.id));
            this.revisedTitle.set(goal.title);
            this.loading.set(false);
          },
          error: (err) => {
            this.toast.error(apiErrorMessage(err, 'That goal could not be found.'));
            this.router.navigate(['/goals']);
          },
        });
    }
  }

  protected fieldError(
    name:
      | 'title'
      | 'lifeAreaId'
      | 'targetDate'
      | 'targetAmount'
      | 'targetCurrency'
      | 'description'
      | 'revisionNote',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }

    if (name === 'targetAmount') {
      return 'The amount to save has to be more than zero.';
    }

    if (name === 'targetCurrency') {
      return 'Choose the currency you are saving in.';
    }

    if (name === 'targetDate') {
      return dateFieldError(control.errors);
    }

    if (control.errors['required']) {
      return name === 'lifeAreaId'
        ? 'Choose the life area this goal belongs to.'
        : 'Give the goal a title.';
    }

    if (control.errors['maxlength']) {
      return {
        title: 'Keep the title under 200 characters.',
        description: 'Keep the description under 4000 characters.',
        revisionNote: 'Keep the note under 1000 characters.',
      }[name as 'title' | 'description' | 'revisionNote'];
    }

    return null;
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    // An amount to save needs its currency: the base one unless another is picked.
    const currency = this.form.controls.targetCurrency;
    if (this.form.controls.targetAmount.value !== null && !currency.value) {
      currency.setValue(this.baseCurrency());
      if (!currency.value) {
        currency.setErrors({ required: true });
      }
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: GoalPayload = {
      title: value.title,
      lifeAreaId: value.lifeAreaId!,
      goalType: value.goalType,
      targetDate: value.targetDate || null,
      targetAmount: value.targetAmount,
      targetCurrency: value.targetAmount === null ? null : value.targetCurrency,
      description: value.description.trim() || null,
      tagIds: this.tagIds(),
      revisionNote: value.revisionNote.trim() || null,
    };

    const id = this.id();
    const request = id
      ? this.goalsService.update(Number(id), payload)
      : this.goalsService.create(payload);

    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (goal) => {
        this.toast.success(
          id ? 'Goal revised.' : `"${goal.title}" is set. Now add some milestones.`,
        );
        this.router.navigate(['/goals', goal.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the goal.'));
      },
    });
  }
}
