import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { of, catchError } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error';
import { GoalsService } from '../../core/services/goals.service';
import {
  LearningService,
  ROADMAP_STATUSES,
  Roadmap,
  RoadmapDetail,
  RoadmapStatus,
} from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { ROADMAP_STATUS_LABELS } from './learning-plan-view';

/** Opens the roadmap dialog (new when `roadmap` is missing); resolves with the saved roadmap, or null. */
export async function openRoadmapEditor(
  modal: NgbModal,
  roadmap?: Roadmap,
): Promise<RoadmapDetail | null> {
  const modalRef = modal.open(RoadmapEditor, { ariaLabelledBy: 'roadmap-editor-heading' });
  (modalRef.componentInstance as RoadmapEditor).configure(roadmap);
  try {
    return (await modalRef.result) as RoadmapDetail;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-roadmap-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="roadmap-editor-heading" class="modal-title h5">
          {{ roadmap() ? 'Edit roadmap' : 'New roadmap' }}
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
          <label class="form-label" for="roadmap-title">Where it leads</label>
          <input
            id="roadmap-title"
            type="text"
            class="form-control"
            [class.is-invalid]="fieldError('title')"
            formControlName="title"
            placeholder="e.g. Become a backend developer"
            autocomplete="off"
            ngbAutofocus
          />
          @if (fieldError('title'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="roadmap-goal">
              Serves the goal <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="roadmap-goal"
              formControlName="goalId"
              placeholder="No particular goal"
            >
              @for (goal of goals(); track goal.id) {
                <ng-option [value]="goal.id">
                  {{ goal.title }}
                </ng-option>
              }
            </ng-select>
          </div>
          @if (roadmap()) {
            <div class="col-sm-6">
              <label class="form-label" for="roadmap-status">Status</label>
              <select id="roadmap-status" class="form-select" formControlName="status">
                @for (status of statuses; track status) {
                  <option [ngValue]="status">{{ statusLabels[status] }}</option>
                }
              </select>
            </div>
          }
        </div>
        <div>
          <label class="form-label" for="roadmap-description">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="roadmap-description"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('description')"
            formControlName="description"
            placeholder="Why this path, and what done looks like"
          ></textarea>
          @if (fieldError('description'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
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
export class RoadmapEditor {
  private readonly fb = inject(FormBuilder);
  private readonly learningService = inject(LearningService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly statuses = ROADMAP_STATUSES;
  protected readonly statusLabels = ROADMAP_STATUS_LABELS;
  protected readonly goals = toSignal(
    inject(GoalsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly roadmap = signal<Roadmap | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    status: this.fb.nonNullable.control<RoadmapStatus>('Active'),
    goalId: this.fb.control<number | null>(null),
  });

  configure(roadmap?: Roadmap): void {
    this.roadmap.set(roadmap ?? null);
    this.form.reset({
      title: roadmap?.title ?? '',
      description: roadmap?.description ?? '',
      status: roadmap?.status ?? 'Active',
      goalId: roadmap?.goalId ?? null,
    });
  }

  protected fieldError(name: 'title' | 'description'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return 'Say where this roadmap leads.';
    }
    return name === 'title'
      ? 'Keep the title under 200 characters.'
      : 'Keep the notes under 2000 characters.';
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.learningService
      .saveRoadmap(this.roadmap()?.id ?? null, {
        title: v.title,
        description: v.description.trim() || null,
        status: v.status,
        goalId: v.goalId,
      })
      .subscribe({
        next: (saved) => this.activeModal.close(saved),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the roadmap.'));
        },
      });
  }
}
