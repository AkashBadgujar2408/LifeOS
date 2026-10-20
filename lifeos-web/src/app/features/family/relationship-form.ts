import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FamilyPerson, FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { RELATION_CHOICES, RelationChoice, relationshipPayload } from './family-view';

/** "You" in the "of …" select (a null contact on the API side). */
const YOU = 0;

/**
 * Adding how someone is related, as one sentence: "<name> is the [parent ▾] of [You ▾]". A child is the same edge
 * read the other way; "something else" takes a word ("Godmother"). The API refuses loops and a second relationship
 * between the same two people, and says so.
 */
@Component({
  selector: 'app-relationship-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form class="border rounded p-3" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <div class="row g-2 align-items-start">
        <div class="col-12 col-md-auto pt-md-2 fw-semibold text-break">{{ name() }} is the</div>
        <div class="col-6 col-md-3">
          <label class="visually-hidden" for="relation-choice">Relation</label>
          <select id="relation-choice" class="form-select" formControlName="choice">
            @for (c of choices; track c.value) {
              <option [ngValue]="c.value" [selected]="c.value === form.controls.choice.value">
                {{ c.label }}
              </option>
            }
          </select>
        </div>
        <div class="col-6 col-md-auto pt-md-2">of</div>
        <div class="col-12 col-md">
          <label class="visually-hidden" for="relation-other">Whom</label>
          <select
            id="relation-other"
            class="form-select"
            [class.is-invalid]="fieldError('other')"
            formControlName="other"
          >
            <option [ngValue]="null" [selected]="form.controls.other.value === null" disabled>
              Choose…
            </option>
            <option [ngValue]="you" [selected]="form.controls.other.value === you">You</option>
            @for (p of others(); track p.contactId) {
              <option
                [ngValue]="p.contactId"
                [selected]="p.contactId === form.controls.other.value"
              >
                {{ p.name }}
              </option>
            }
          </select>
          @if (fieldError('other'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
      </div>
      <div class="mt-2">
        <label class="form-label small fw-semibold" for="relation-label">
          {{
            form.controls.choice.value === 'Other' ? 'What are they?' : 'A word for it (optional)'
          }}
        </label>
        <input
          id="relation-label"
          type="text"
          class="form-control"
          [class.is-invalid]="fieldError('label')"
          formControlName="label"
          maxlength="50"
          [placeholder]="
            form.controls.choice.value === 'Other'
              ? 'Cousin, godmother, guardian…'
              : 'Mother, step-father, wife…'
          "
        />
        @if (fieldError('label'); as error) {
          <div class="invalid-feedback d-block">{{ error }}</div>
        }
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
export class RelationshipForm {
  private readonly familyService = inject(FamilyService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly contactId = input.required<number>();
  readonly name = input.required<string>();
  readonly people = input.required<FamilyPerson[]>();
  readonly added = output<void>();
  readonly cancelled = output<void>();

  protected readonly choices = RELATION_CHOICES;
  protected readonly you = YOU;
  protected readonly saving = signal(false);
  private readonly attempted = signal(false);

  protected readonly others = computed(() =>
    this.people().filter((p) => p.contactId !== this.contactId()),
  );

  protected readonly form = this.fb.group({
    choice: this.fb.nonNullable.control<RelationChoice>('Parent'),
    other: this.fb.control<number | null>(YOU, Validators.required),
    label: this.fb.nonNullable.control('', Validators.maxLength(50)),
  });

  protected fieldError(name: 'other' | 'label'): string | null {
    const { other, label } = this.form.controls;
    if (!this.attempted() && !this.form.controls[name].touched) {
      return null;
    }
    if (name === 'other') {
      return other.value === null ? 'Choose whom they are related to.' : null;
    }
    if (this.form.controls.choice.value === 'Other' && label.value.trim() === '') {
      return 'Say how they are related — cousin, godmother…';
    }
    return label.errors ? 'Keep it to 50 characters.' : null;
  }

  protected save(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.fieldError('other') || this.fieldError('label')) {
      return;
    }
    const { choice, other, label } = this.form.getRawValue();
    const payload = {
      ...relationshipPayload(this.contactId(), choice, other === YOU ? null : other),
      label: label.trim() || null,
    };
    this.saving.set(true);
    this.familyService
      .addRelationship(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.attempted.set(false);
          this.form.reset({ choice: 'Parent', other: YOU, label: '' });
          this.added.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not add the relationship.'));
        },
      });
  }
}
