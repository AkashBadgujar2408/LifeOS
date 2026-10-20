import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { GoalSourceKind, GoalSourceOption, GoalsService } from '../../core/services/goals.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { SOURCE_KIND_LABELS, sameUnit } from './goal-measure';

/**
 * Choosing what a counted goal is counted from. The API lists every option with the unit it counts in; only the ones
 * in the goal's unit can be picked (a "pages" habit can't feed a "steps" goal), the rest are named so it's clear what
 * a different unit would allow.
 */
@Component({
  selector: 'app-goal-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form class="border rounded p-3" [formGroup]="form" (ngSubmit)="add()" novalidate>
      <div class="row g-2">
        <div class="col-md-7">
          <label class="form-label small fw-semibold" for="goal-source-option">Count from</label>
          <select
            id="goal-source-option"
            class="form-select"
            [class.is-invalid]="optionError()"
            formControlName="option"
          >
            <option [ngValue]="null" [selected]="form.controls.option.value === null" disabled>
              {{ loading() ? 'Loading…' : 'Choose…' }}
            </option>
            @for (group of groups(); track group.kind) {
              <optgroup [label]="group.label">
                @for (o of group.options; track $index) {
                  <option [ngValue]="o" [selected]="o === form.controls.option.value">
                    {{ o.title }}
                  </option>
                }
              </optgroup>
            }
          </select>
          @if (optionError(); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          } @else if (!loading() && groups().length === 0) {
            <div class="form-text">
              Nothing counts in {{ unit() }} yet.
              @if (otherUnits(); as units) {
                Things here count in {{ units }} — measure the goal in one of those to use them.
              }
            </div>
          }
        </div>
        <div class="col-md-5">
          <label class="form-label small fw-semibold" for="goal-source-from">Counting from</label>
          <div class="input-group">
            <input
              id="goal-source-from"
              type="text"
              class="form-control"
              [class.is-invalid]="fromError()"
              formControlName="countsFrom"
              placeholder="14/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #fromPicker="ngbDatepicker"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day counting starts"
              (click)="fromPicker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fromError(); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          } @else {
            <div class="form-text">
              Nothing before this day counts. Pick an earlier day to include it.
            </div>
          }
        </div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary" [disabled]="saving()">Add</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="cancelled.emit()">
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class GoalSourcePicker implements OnInit {
  private readonly goalsService = inject(GoalsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly goalId = input.required<number>();
  readonly unit = input.required<string>();
  /** A roadmap's % has to be a goal's only source. */
  readonly hasSources = input(false);
  readonly added = output<void>();
  readonly cancelled = output<void>();

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  private readonly options = signal<GoalSourceOption[]>([]);

  protected readonly form = this.fb.group({
    option: this.fb.control<GoalSourceOption | null>(null, Validators.required),
    countsFrom: this.fb.control<string | null>(todayIso(), Validators.required),
  });

  /** Options in the goal's unit, grouped by kind in the API's order. */
  protected readonly groups = computed(() => {
    const fitting = this.options().filter(
      (o) => sameUnit(o.unit, this.unit()) && !(o.kind === 'Roadmap' && this.hasSources()),
    );
    const kinds = [...new Set(fitting.map((o) => o.kind))];
    return kinds.map((kind: GoalSourceKind) => ({
      kind,
      label: SOURCE_KIND_LABELS[kind],
      options: fitting.filter((o) => o.kind === kind),
    }));
  });

  protected readonly otherUnits = computed(() => {
    const units = [...new Set(this.options().map((o) => o.unit))].sort();
    return units.length === 0 ? null : units.join(', ');
  });

  ngOnInit(): void {
    this.goalsService
      .sourceOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => {
          this.options.set(options);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not load what can be counted.'));
        },
      });
  }

  protected optionError(): string | null {
    const control = this.form.controls.option;
    return control.errors && (this.attempted() || control.touched)
      ? 'Choose what the goal is counted from.'
      : null;
  }

  protected fromError(): string | null {
    const control = this.form.controls.countsFrom;
    if (!control.errors || (!this.attempted() && !control.touched)) {
      return null;
    }
    return control.errors['required']
      ? 'Choose the day counting starts.'
      : dateFieldError(control.errors);
  }

  protected add(): void {
    this.attempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { option, countsFrom } = this.form.getRawValue();
    this.saving.set(true);
    this.goalsService
      .addSource(this.goalId(), {
        kind: option!.kind,
        entityType: option!.entityType,
        entityId: option!.entityId,
        filter: option!.filter,
        metric: option!.metric,
        countsFrom,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (source) => {
          this.saving.set(false);
          this.toast.success(`The goal now counts ${source.title}.`);
          this.added.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not add it.'));
        },
      });
  }
}
