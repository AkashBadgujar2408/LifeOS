import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Habit, HabitsService } from '../../core/services/habits.service';
import {
  Hobby,
  HobbyDetail,
  HobbyStatus,
  LeisureService,
} from '../../core/services/leisure.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { pickableLifeAreas } from '../../core/settings/visibility';

/** Opens the hobby dialog (new when `hobby` is missing); resolves with the saved hobby, or null if dismissed. */
export async function openHobbyEditor(modal: NgbModal, hobby?: Hobby): Promise<HobbyDetail | null> {
  const modalRef = modal.open(HobbyEditor, { ariaLabelledBy: 'hobby-editor-heading' });
  (modalRef.componentInstance as HobbyEditor).configure(hobby);
  try {
    return (await modalRef.result) as HobbyDetail;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-hobby-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="hobby-editor-heading" class="modal-title h5">
          {{ hobby() ? 'Edit hobby' : 'Add a hobby' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div>
          <label class="form-label" for="hobby-name">Name</label>
          <input
            id="hobby-name"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('name')"
            formControlName="name"
            placeholder="e.g. Guitar, Sketching, Gardening"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('name'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="hobby-description">
            What it is to you <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="hobby-description"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('description')"
            formControlName="description"
            placeholder="Where you are with it, what you're working on"
          ></textarea>
          @if (fieldError('description'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="hobby-habit">
              Practised through a habit <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="hobby-habit"
              formControlName="habitId"
              placeholder="Pick a habit (optional)"
            >
              @for (habit of habits(); track habit.id) {
                <ng-option [value]="habit.id">{{ habit.title }}</ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="hobby-life-area">
              Life area <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="hobby-life-area"
              formControlName="lifeAreaId"
              placeholder="Pick a life area (optional)"
            >
              @for (
                area of pickableLifeAreas(
                  lifeAreas(),
                  hiddenAreaIds(),
                  form.controls.lifeAreaId.value
                );
                track area.id
              ) {
                <ng-option [value]="area.id">{{ area.name }}</ng-option>
              }
            </ng-select>
          </div>
        </div>
        @if (hobby()) {
          <div class="form-check">
            <input
              id="hobby-archived"
              type="checkbox"
              class="form-check-input"
              formControlName="archived"
            />
            <label class="form-check-label" for="hobby-archived"
              >Archived (kept, out of the way)</label
            >
          </div>
        }
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class HobbyEditor {
  private readonly fb = inject(FormBuilder);
  private readonly leisureService = inject(LeisureService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly hiddenAreaIds = inject(SettingsService).hiddenLifeAreaIds;
  protected readonly pickableLifeAreas = pickableLifeAreas;
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });
  protected readonly habits = signal<Habit[]>([]);
  protected readonly hobby = signal<Hobby | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(1000)),
    habitId: this.fb.control<number | null>(null),
    lifeAreaId: this.fb.control<number | null>(null),
    archived: this.fb.nonNullable.control(false),
  });

  constructor() {
    const today = todayIso();
    inject(HabitsService)
      .list(today, today)
      .subscribe({ next: (habits) => this.habits.set(habits), error: () => undefined });
  }

  configure(hobby?: Hobby): void {
    this.hobby.set(hobby ?? null);
    this.form.reset({
      name: hobby?.name ?? '',
      description: hobby?.description ?? '',
      habitId: hobby?.habitId ?? null,
      lifeAreaId: hobby?.lifeAreaId ?? null,
      archived: hobby?.status === 'Archived',
    });
  }

  protected fieldError(name: 'name' | 'description'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'name') {
      return control.errors['required']
        ? 'Give the hobby a name.'
        : 'Keep it under 100 characters.';
    }
    return 'Keep it under 1000 characters.';
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const status: HobbyStatus = v.archived ? 'Archived' : 'Active';
    this.saving.set(true);
    this.leisureService
      .saveHobby(this.hobby()?.id ?? null, {
        name: v.name,
        description: v.description.trim() || null,
        status,
        habitId: v.habitId,
        lifeAreaId: v.lifeAreaId,
      })
      .subscribe({
        next: (saved) => this.activeModal.close(saved),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the hobby.'));
        },
      });
  }
}
