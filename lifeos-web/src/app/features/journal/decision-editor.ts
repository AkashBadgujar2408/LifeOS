import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  DECISION_ENTITY_TYPE,
  Decision,
  DecisionPayload,
  DecisionVerdict,
  DecisionsService,
} from '../../core/services/decisions.service';
import { ToastService } from '../../core/services/toast.service';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { REVIEW_AFTER, VERDICTS, reviewDayAfter, reviewState } from './decision-view';

export type DecisionEditorResult =
  { kind: 'saved'; decision: Decision } | { kind: 'deleted'; decisionId: number };

/** Opens the decision editor: a new decision made on `day` (default today), or an existing one with its outcome. */
export async function openDecisionEditor(
  modal: NgbModal,
  options: { decision?: Decision; day?: string } = {},
): Promise<DecisionEditorResult | null> {
  const modalRef = modal.open(DecisionEditor, {
    ariaLabelledBy: 'decision-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as DecisionEditor).configure(options);
  try {
    return (await modalRef.result) as DecisionEditorResult;
  } catch {
    return null;
  }
}

// Mirrors CK_Decisions_ReviewOn.
function decisionRules(group: AbstractControl): ValidationErrors | null {
  const { decidedOn, reviewOn } = group.value as {
    decidedOn: string | null;
    reviewOn: string | null;
  };
  return decidedOn && reviewOn && reviewOn < decidedOn ? { reviewBeforeDecision: true } : null;
}

@Component({
  selector: 'app-decision-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, LinkedItems],
  templateUrl: './decision-editor.html',
})
export class DecisionEditor {
  private readonly fb = inject(FormBuilder);
  private readonly decisionsService = inject(DecisionsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly verdicts = VERDICTS;
  protected readonly reviewAfter = REVIEW_AFTER;
  protected readonly entityType = DECISION_ENTITY_TYPE;
  protected readonly today = todayIso();
  protected readonly minDate = { year: 1940, month: 1, day: 1 };
  protected readonly maxDate = { year: 2100, month: 12, day: 31 };

  protected readonly decision = signal<Decision | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      decidedOn: this.fb.control<string | null>(null, Validators.required),
      title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(300)]),
      reasons: this.fb.nonNullable.control('', Validators.maxLength(4000)),
      expectedOutcome: this.fb.nonNullable.control('', Validators.maxLength(4000)),
      reviewOn: this.fb.control<string | null>(null),
      actualOutcome: this.fb.nonNullable.control('', Validators.maxLength(4000)),
      verdict: this.fb.control<DecisionVerdict | null>(null),
    },
    { validators: decisionRules },
  );

  configure(options: { decision?: Decision; day?: string }): void {
    const decision = options.decision ?? null;
    this.decision.set(decision);
    this.form.reset({
      decidedOn: decision?.decidedOn ?? options.day ?? this.today,
      title: decision?.title ?? '',
      reasons: decision?.reasons ?? '',
      expectedOutcome: decision?.expectedOutcome ?? '',
      reviewOn: decision?.reviewOn ?? null,
      actualOutcome: decision?.actualOutcome ?? '',
      verdict: decision?.verdict ?? null,
    });
  }

  /** The outcome section shows once the decision exists — open, due or already reviewed. */
  protected reviewLabel(): string {
    const decision = this.decision();
    if (!decision) {
      return '';
    }
    switch (reviewState(decision, this.today)) {
      case 'due':
        return 'Its review day has come: how did it turn out?';
      case 'reviewed':
        return 'How it turned out';
      default:
        return 'Already know how it turned out? Record it any time.';
    }
  }

  protected setReviewAfter(days: number): void {
    const decidedOn = this.form.controls.decidedOn.value ?? this.today;
    this.form.controls.reviewOn.setValue(reviewDayAfter(decidedOn, days));
    this.form.controls.reviewOn.markAsDirty();
  }

  protected setVerdict(verdict: DecisionVerdict): void {
    const control = this.form.controls.verdict;
    control.setValue(control.value === verdict ? null : verdict);
  }

  protected fieldError(
    name: 'decidedOn' | 'title' | 'reasons' | 'expectedOutcome' | 'reviewOn' | 'actualOutcome',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'decidedOn' || name === 'reviewOn') {
      return (
        dateFieldError(control.errors) ??
        (name === 'decidedOn' && control.errors?.['required']
          ? 'Pick the day you decided.'
          : null) ??
        (name === 'reviewOn' && this.form.errors?.['reviewBeforeDecision']
          ? "The review day can't be before the decision."
          : null)
      );
    }
    if (control.errors?.['required']) {
      return 'Say what you decided.';
    }
    if (control.errors?.['maxlength']) {
      return name === 'title' ? 'Keep it under 300 characters.' : 'Keep it under 4000 characters.';
    }
    return null;
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const payload: DecisionPayload = {
      decidedOn: v.decidedOn!,
      title: v.title,
      reasons: v.reasons.trim() || null,
      expectedOutcome: v.expectedOutcome.trim() || null,
      reviewOn: v.reviewOn,
      timeZone: browserTimeZone(),
    };
    const existing = this.decision();
    const outcome = v.actualOutcome.trim() || null;
    const outcomeChanged =
      existing !== null &&
      (outcome !== (existing.actualOutcome ?? null) ||
        (outcome !== null && v.verdict !== existing.verdict));

    this.saving.set(true);
    const save$ = existing
      ? this.decisionsService.update(existing.id, payload)
      : this.decisionsService.create(payload);
    save$.subscribe({
      next: (saved) => {
        if (!outcomeChanged) {
          this.activeModal.close({ kind: 'saved', decision: saved } satisfies DecisionEditorResult);
          return;
        }
        this.decisionsService
          .recordOutcome(saved.id, {
            actualOutcome: outcome,
            verdict: outcome ? v.verdict : null,
            today: this.today,
            timeZone: browserTimeZone(),
          })
          .subscribe({
            next: (reviewed) =>
              this.activeModal.close({
                kind: 'saved',
                decision: reviewed,
              } satisfies DecisionEditorResult),
            error: (err) => {
              this.saving.set(false);
              this.toast.error(apiErrorMessage(err, 'Saved, but could not record the outcome.'));
            },
          });
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the decision.'));
      },
    });
  }

  protected async remove(): Promise<void> {
    const decision = this.decision();
    if (!decision) {
      return;
    }
    const answer = await Swal.fire({
      title: `Delete "${decision.title}"?`,
      text: 'Its review reminder and links go with it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete decision',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.decisionsService.remove(decision.id).subscribe({
      next: () =>
        this.activeModal.close({
          kind: 'deleted',
          decisionId: decision.id,
        } satisfies DecisionEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the decision.')),
    });
  }
}
