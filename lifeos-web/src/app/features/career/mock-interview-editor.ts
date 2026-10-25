import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { catchError, of } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  CareerService,
  MOCK_INTERVIEW_ENTITY_TYPE,
  MOCK_INTERVIEW_TOOLS,
  MockInterview,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';

export type MockInterviewEditorResult =
  { kind: 'saved'; mock: MockInterview } | { kind: 'deleted' };

/**
 * Opens a mock interview (new when missing — practice for `applicationId` when given); resolves with what
 * happened, or null if dismissed.
 */
export async function openMockInterviewEditor(
  modal: NgbModal,
  mock?: MockInterview,
  applicationId?: number,
): Promise<MockInterviewEditorResult | null> {
  const modalRef = modal.open(MockInterviewEditor, {
    ariaLabelledBy: 'mock-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as MockInterviewEditor).configure(mock, applicationId);
  try {
    return (await modalRef.result) as MockInterviewEditorResult;
  } catch {
    return null;
  }
}

/**
 * A record of a practice interview done by voice with an AI outside LifeOS (Session 54a) — nothing runs here.
 * Picking an application fills a blank role with its role. Once saved it can be linked to the questions to
 * practise.
 */
@Component({
  selector: 'app-mock-interview-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="mock-editor-heading" class="modal-title h5">
          {{ mock() ? 'Mock interview' : 'Record a mock interview' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="mock-held-on">Held on</label>
            <div class="input-group">
              <input
                id="mock-held-on"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('heldOn')"
                formControlName="heldOn"
                placeholder="e.g. 24/Oct/2026"
                autocomplete="off"
                ngbDatepicker
                #heldPicker="ngbDatepicker"
                [minDate]="minDate"
                [maxDate]="maxDate"
                container="body"
                ngbAutofocus
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Pick the day"
                (click)="heldPicker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('heldOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="mock-tool">Which AI</label>
            <input
              id="mock-tool"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('tool')"
              formControlName="tool"
              placeholder="e.g. Gemini"
              list="mock-tool-options"
              autocomplete="off"
            />
            <datalist id="mock-tool-options">
              @for (tool of tools; track tool) {
                <option [value]="tool"></option>
              }
            </datalist>
            @if (fieldError('tool'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="mock-minutes">
              Minutes <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="mock-minutes"
              type="number"
              inputmode="numeric"
              min="1"
              max="600"
              step="1"
              class="form-control"
              [class.is-invalid]="fieldError('durationMinutes')"
              formControlName="durationMinutes"
              placeholder="e.g. 30"
            />
            @if (fieldError('durationMinutes'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="mock-application">
              Practice for <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="mock-application"
              formControlName="applicationId"
              placeholder="General practice"
            >
              @for (a of applications(); track a.id) {
                <ng-option [value]="a.id"> {{ a.role }} at {{ a.organisation }} </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="mock-role">
              Role it interviewed you for <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="mock-role"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('role')"
              formControlName="role"
              placeholder="e.g. Senior backend engineer"
            />
            @if (fieldError('role'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="mock-rating">
            Rating it gave <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="mock-rating"
            type="text"
            class="form-control"
            style="max-width: 16rem"
            [class.is-invalid]="fieldError('rating')"
            formControlName="rating"
            placeholder="As it said it, e.g. 7/10"
          />
          @if (fieldError('rating'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="mock-strengths">
            Strengths <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="mock-strengths"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('strengths')"
            formControlName="strengths"
            placeholder="What it said went well — clear structure, good examples"
          ></textarea>
          @if (fieldError('strengths'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="mock-improvements">
            What to improve <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="mock-improvements"
            class="form-control"
            rows="3"
            [class.is-invalid]="fieldError('improvements')"
            formControlName="improvements"
            placeholder="What it said to work on — shorter answers, numbers for impact"
          ></textarea>
          @if (fieldError('improvements'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="mock-notes">
            Your notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="mock-notes"
            class="form-control"
            rows="2"
            [class.is-invalid]="fieldError('notes')"
            formControlName="notes"
            placeholder="How it felt, what you'd do differently in the real one"
          ></textarea>
          @if (fieldError('notes'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>

        @if (mock(); as existing) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the questions from your question bank you want to practise after this one.
            </p>
            <app-linked-items [entityType]="entityType" [entityId]="existing.id" />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (mock()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class MockInterviewEditor {
  private readonly fb = inject(FormBuilder);
  private readonly careerService = inject(CareerService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly entityType = MOCK_INTERVIEW_ENTITY_TYPE;
  protected readonly tools = MOCK_INTERVIEW_TOOLS;
  protected readonly minDate = { year: 2000, month: 1, day: 1 };
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly applications = toSignal(
    this.careerService.applications().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly mock = signal<MockInterview | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    heldOn: this.fb.control<string | null>(todayIso(), Validators.required),
    tool: this.fb.nonNullable.control('Gemini', [Validators.required, Validators.maxLength(100)]),
    durationMinutes: this.fb.control<number | null>(null, [
      Validators.min(1),
      Validators.max(600),
      Validators.pattern(/^\d+$/),
    ]),
    applicationId: this.fb.control<number | null>(null),
    role: this.fb.nonNullable.control('', Validators.maxLength(200)),
    rating: this.fb.nonNullable.control('', Validators.maxLength(50)),
    strengths: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    improvements: this.fb.nonNullable.control('', Validators.maxLength(4000)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  constructor() {
    // Picking an application fills a blank role with its role.
    this.form.controls.applicationId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.fillRole(id));
  }

  configure(mock?: MockInterview, applicationId?: number): void {
    this.mock.set(mock ?? null);
    this.form.reset(
      {
        heldOn: mock?.heldOn ?? todayIso(),
        tool: mock?.tool ?? 'Gemini',
        durationMinutes: mock?.durationMinutes ?? null,
        applicationId: mock ? mock.jobApplicationId : (applicationId ?? null),
        role: mock?.role ?? '',
        rating: mock?.rating ?? '',
        strengths: mock?.strengths ?? '',
        improvements: mock?.improvements ?? '',
        notes: mock?.notes ?? '',
      },
      { emitEvent: false },
    );
    if (!mock && applicationId) {
      // The applications may still be loading; fill the role once they're here.
      this.careerService.application(applicationId).subscribe({
        next: (a) => {
          if (!this.form.controls.role.value.trim()) {
            this.form.controls.role.setValue(a.role);
          }
        },
        error: () => undefined,
      });
    }
  }

  private fillRole(id: number | null): void {
    const application = this.applications().find((a) => a.id === id);
    if (application && !this.form.controls.role.value.trim()) {
      this.form.controls.role.setValue(application.role);
    }
  }

  protected fieldError(
    name:
      | 'heldOn'
      | 'tool'
      | 'durationMinutes'
      | 'role'
      | 'rating'
      | 'strengths'
      | 'improvements'
      | 'notes',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'heldOn') {
      return control.errors['required'] ? 'When was it?' : dateFieldError(control.errors);
    }
    if (name === 'tool' && control.errors['required']) {
      return 'Say which AI ran it.';
    }
    if (name === 'durationMinutes') {
      return 'Whole minutes, 1 to 600.';
    }
    return 'That is too long.';
  }

  protected submit(): void {
    const tool = this.form.controls.tool;
    tool.setValue(tool.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.careerService
      .saveMockInterview(this.mock()?.id ?? null, {
        heldOn: v.heldOn!,
        today: todayIso(),
        tool: v.tool,
        durationMinutes: v.durationMinutes,
        role: v.role.trim() || null,
        rating: v.rating.trim() || null,
        strengths: v.strengths.trim() || null,
        improvements: v.improvements.trim() || null,
        notes: v.notes.trim() || null,
        jobApplicationId: v.applicationId,
      })
      .subscribe({
        next: (mock) => this.activeModal.close({ kind: 'saved', mock }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the mock interview.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const mock = this.mock();
    if (!mock) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete this mock interview?',
      text: 'Its links to questions go with it; the questions stay in your bank.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeMockInterview(mock.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) =>
        this.toast.error(apiErrorMessage(err, 'Could not delete the mock interview.')),
    });
  }
}
