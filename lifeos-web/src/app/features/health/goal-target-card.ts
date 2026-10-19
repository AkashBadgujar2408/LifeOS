import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  GOAL_TARGET_KINDS,
  GoalTarget,
  GoalTargetKind,
  HealthLockedError,
  HealthService,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { MEASUREMENTS, measurementText } from './health-view';

/**
 * A goal measured by the body ("Weigh 75 kg"): set the measure and target here; progress follows the latest
 * measurement in Health › Body. Locked until the vault is open, since the numbers are health data.
 */
@Component({
  selector: 'app-goal-target-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, ReactiveFormsModule],
  template: `
    @if (locked()) {
      <p class="small text-body-secondary mb-2">A health target's numbers are private.</p>
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="load(true)">
        <i class="bi bi-shield-lock" aria-hidden="true"></i> Unlock to see or set one
      </button>
    } @else if (editing()) {
      <form class="d-flex flex-column gap-2" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="row g-2">
          <div class="col-sm-4">
            <label class="form-label small" for="target-kind">Measure</label>
            <select id="target-kind" class="form-select form-select-sm" formControlName="kind">
              @for (k of kinds; track k) {
                <option [ngValue]="k" [selected]="k === form.controls.kind.value">
                  {{ info[k].label }} ({{ info[k].unit }})
                </option>
              }
            </select>
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label small" for="target-start">Starting at</label>
            <input
              id="target-start"
              type="number"
              step="0.01"
              class="form-control form-control-sm"
              formControlName="startValue"
              placeholder="Latest reading"
            />
          </div>
          <div class="col-6 col-sm-4">
            <label class="form-label small" for="target-value">Target</label>
            <input
              id="target-value"
              type="number"
              step="0.01"
              class="form-control form-control-sm"
              [class.is-invalid]="targetError()"
              formControlName="targetValue"
              [placeholder]="info[form.controls.kind.value].placeholder"
            />
            @if (targetError(); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-primary" [disabled]="saving()">
            Save target
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            (click)="editing.set(false)"
          >
            Cancel
          </button>
        </div>
      </form>
    } @else if (target(); as t) {
      <div class="d-flex justify-content-between small mb-1">
        <span
          >{{ info[t.kind].label }}: {{ show(t, t.startValue) }} →
          <strong>{{ show(t, t.targetValue) }}</strong></span
        >
        <span class="fw-semibold">{{ t.percent }}%</span>
      </div>
      <div
        class="progress mb-2"
        role="progressbar"
        [attr.aria-valuenow]="t.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-label]="'Health target ' + t.percent + '% of the way'"
      >
        <div class="progress-bar" [style.width.%]="t.percent"></div>
      </div>
      <p class="small text-body-secondary mb-2">
        @if (t.latestValue !== null) {
          Latest {{ show(t, t.latestValue) }} on {{ t.latestOn | date }} —
          <a routerLink="/health/body">add a reading</a> to move it.
        } @else {
          No reading yet — <a routerLink="/health/body">add one in Health › Body</a>.
        }
      </p>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-primary" (click)="edit()">
          Change
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" (click)="remove()">
          Remove
        </button>
      </div>
    } @else if (loaded()) {
      <p class="small text-body-secondary mb-2">
        Measure this goal by your body — a weight, a waist size, a resting pulse.
      </p>
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="edit()">
        <i class="bi bi-plus-lg"></i> Set a health target
      </button>
    }
  `,
})
export class GoalTargetCard {
  private readonly fb = inject(FormBuilder);
  private readonly healthService = inject(HealthService);
  private readonly toast = inject(ToastService);

  readonly goalId = input.required<number>();

  protected readonly kinds = GOAL_TARGET_KINDS;
  protected readonly info = MEASUREMENTS;
  protected readonly target = signal<GoalTarget | null>(null);
  protected readonly loaded = signal(false);
  protected readonly locked = signal(!this.healthService.isUnlocked());
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<GoalTargetKind>('Weight'),
    startValue: this.fb.control<number | null>(null),
    targetValue: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
  });

  constructor() {
    // Read straight away only when already unlocked; otherwise wait for the button (no prompt on page open).
    effect(() => {
      this.goalId();
      if (this.healthService.isUnlocked()) {
        this.load(false);
      }
    });
  }

  protected show(t: GoalTarget, value: number): string {
    return measurementText({ kind: t.kind, value, value2: null });
  }

  protected targetError(): string | null {
    const control = this.form.controls.targetValue;
    return control.touched && control.errors ? 'Give the target.' : null;
  }

  protected load(prompt: boolean): void {
    if (prompt) {
      void this.healthService.unlock().then((ok) => ok && this.load(false));
      return;
    }
    this.healthService.goalTarget(this.goalId()).subscribe({
      next: (target) => {
        this.target.set(target);
        this.loaded.set(true);
        this.locked.set(false);
      },
      error: (err) => {
        if (err instanceof HealthLockedError) {
          this.locked.set(true);
        } else {
          this.toast.error(apiErrorMessage(err, 'Could not load the health target.'));
        }
      },
    });
  }

  protected edit(): void {
    const t = this.target();
    this.form.reset({
      kind: t?.kind ?? 'Weight',
      startValue: t?.startValue ?? null,
      targetValue: t?.targetValue ?? null,
    });
    this.editing.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.healthService
      .saveGoalTarget(this.goalId(), {
        kind: v.kind,
        startValue: v.startValue,
        targetValue: v.targetValue!,
      })
      .subscribe({
        next: (target) => {
          this.saving.set(false);
          this.editing.set(false);
          this.target.set(target);
          this.toast.success('Health target saved.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the target.'));
        },
      });
  }

  protected remove(): void {
    this.healthService.removeGoalTarget(this.goalId()).subscribe({
      next: () => {
        this.target.set(null);
        this.toast.success('Health target removed.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not remove the target.')),
    });
  }
}
