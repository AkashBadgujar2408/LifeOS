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
import {
  FamilyPerson,
  FamilyService,
  SignificantDate,
  SignificantDateKind,
} from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { DATE_KIND_LABELS, MONTHS, daysInMonth } from './family-view';

const YOU = 0;

/**
 * A birthday, anniversary or other yearly day for one person. Day + month + an optional year rather than a
 * datepicker: these days come round every year and the year is often unknown, so a full date would force a guess.
 */
@Component({
  selector: 'app-date-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form class="border rounded p-3" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <div class="row g-2">
        <div class="col-12 col-md-4">
          <label class="form-label small fw-semibold" for="date-kind">What day</label>
          <select id="date-kind" class="form-select" formControlName="kind">
            @for (k of kinds; track k) {
              <option [ngValue]="k" [selected]="k === form.controls.kind.value">
                {{ kindLabels[k] }}
              </option>
            }
          </select>
        </div>
        @if (form.controls.kind.value === 'Other') {
          <div class="col-12 col-md-8">
            <label class="form-label small fw-semibold" for="date-label">Name of the day</label>
            <input
              id="date-label"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('label')"
              formControlName="label"
              maxlength="100"
              placeholder="Remembrance day, name day…"
            />
            @if (fieldError('label'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        @if (form.controls.kind.value === 'Anniversary') {
          <div class="col-12 col-md-8">
            <label class="form-label small fw-semibold" for="date-with">With</label>
            <select id="date-with" class="form-select" formControlName="with">
              <option [ngValue]="you" [selected]="form.controls.with.value === you">You</option>
              @for (p of others(); track p.contactId) {
                <option
                  [ngValue]="p.contactId"
                  [selected]="p.contactId === form.controls.with.value"
                >
                  {{ p.name }}
                </option>
              }
            </select>
          </div>
        }
        <div class="col-4 col-md-2">
          <label class="form-label small fw-semibold" for="date-day">Day</label>
          <select
            id="date-day"
            class="form-select"
            [class.is-invalid]="fieldError('day')"
            formControlName="day"
          >
            @for (d of days(); track d) {
              <option [ngValue]="d" [selected]="d === form.controls.day.value">{{ d }}</option>
            }
          </select>
        </div>
        <div class="col-8 col-md-3">
          <label class="form-label small fw-semibold" for="date-month">Month</label>
          <select id="date-month" class="form-select" formControlName="month">
            @for (m of months; track m; let i = $index) {
              <option [ngValue]="i + 1" [selected]="i + 1 === form.controls.month.value">
                {{ m }}
              </option>
            }
          </select>
        </div>
        <div class="col-12 col-md-3">
          <label class="form-label small fw-semibold" for="date-year">Year (if known)</label>
          <input
            id="date-year"
            type="number"
            class="form-control"
            [class.is-invalid]="fieldError('year')"
            formControlName="year"
            placeholder="e.g. 1966"
            min="1850"
            [max]="thisYear"
          />
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label small fw-semibold" for="date-notes">Note (optional)</label>
          <input
            id="date-notes"
            type="text"
            class="form-control"
            formControlName="notes"
            maxlength="2000"
            placeholder="Loves sunflowers"
          />
        </div>
        @if (fieldError('day') ?? fieldError('year'); as error) {
          <div class="col-12">
            <div class="invalid-feedback d-block mt-0">{{ error }}</div>
          </div>
        }
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="submit" class="btn btn-sm btn-primary" [disabled]="saving()">
          {{ date() ? 'Save' : 'Add' }}
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="cancelled.emit()">
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class DateForm implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly contactId = input.required<number>();
  readonly people = input.required<FamilyPerson[]>();
  /** Editing this one; null adds a new day. */
  readonly date = input<SignificantDate | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly kinds: SignificantDateKind[] = ['Birthday', 'Anniversary', 'Other'];
  protected readonly kindLabels = DATE_KIND_LABELS;
  protected readonly months = MONTHS;
  protected readonly you = YOU;
  protected readonly thisYear = new Date().getFullYear();
  protected readonly saving = signal(false);
  private readonly attempted = signal(false);
  private readonly month = signal(1);

  protected readonly days = computed(() =>
    Array.from({ length: daysInMonth(this.month()) }, (_, i) => i + 1),
  );
  protected readonly others = computed(() =>
    this.people().filter((p) => p.contactId !== this.contactId()),
  );

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<SignificantDateKind>('Birthday'),
    label: this.fb.nonNullable.control('', Validators.maxLength(100)),
    with: this.fb.nonNullable.control<number>(YOU),
    day: this.fb.nonNullable.control(1),
    month: this.fb.nonNullable.control(1),
    year: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control(''),
  });

  ngOnInit(): void {
    const date = this.date();
    if (date) {
      this.form.setValue({
        kind: date.kind,
        label: date.label ?? '',
        with: date.otherContactId ?? YOU,
        day: date.day,
        month: date.month,
        year: date.year,
        notes: date.notes ?? '',
      });
    }
    this.month.set(this.form.controls.month.value);
    this.form.controls.month.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((month) => {
        this.month.set(month);
        // 31 Jan → Feb: keep the day inside the month.
        if (this.form.controls.day.value > daysInMonth(month)) {
          this.form.controls.day.setValue(daysInMonth(month));
        }
      });
  }

  protected fieldError(name: 'label' | 'day' | 'year'): string | null {
    if (!this.attempted()) {
      return null;
    }
    const { kind, label, day, month, year } = this.form.getRawValue();
    if (name === 'label') {
      return kind === 'Other' && label.trim() === '' ? 'Name the day — a remembrance day…' : null;
    }
    if (name === 'day') {
      return day > daysInMonth(month) ? `That month has ${daysInMonth(month)} days.` : null;
    }
    if (year === null) {
      return null;
    }
    if (!Number.isInteger(year) || year < 1850 || year > this.thisYear) {
      return `Give a year between 1850 and ${this.thisYear}, or leave it out.`;
    }
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return month === 2 && day === 29 && !leap
      ? `${year} wasn't a leap year — there was no 29 Feb.`
      : null;
  }

  protected save(): void {
    this.attempted.set(true);
    if (this.fieldError('label') || this.fieldError('day') || this.fieldError('year')) {
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.familyService
      .saveDate(this.date()?.id ?? null, {
        contactId: this.contactId(),
        otherContactId: value.kind === 'Anniversary' && value.with !== YOU ? value.with : null,
        kind: value.kind,
        label: value.kind === 'Other' ? value.label.trim() : null,
        month: value.month,
        day: value.day,
        year: value.year,
        notes: value.notes.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the day.'));
        },
      });
  }
}
