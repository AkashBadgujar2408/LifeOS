import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ContactsService } from '../../core/services/contacts.service';
import {
  FinanceService,
  InsurancePolicy,
  POLICY_KINDS,
  PREMIUM_FREQUENCIES,
  PolicyKind,
  PremiumFrequency,
} from '../../core/services/finance.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { POLICY_KIND_LABELS, PREMIUM_FREQUENCY_LABELS } from './finance-view';

export type PolicyEditorResult = { kind: 'saved'; policy: InsurancePolicy } | { kind: 'deleted' };

/** Opens a policy (new when missing); resolves with what happened, or null if dismissed. */
export async function openPolicyEditor(
  modal: NgbModal,
  policy?: InsurancePolicy,
): Promise<PolicyEditorResult | null> {
  const modalRef = modal.open(PolicyEditor, {
    ariaLabelledBy: 'policy-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as PolicyEditor).configure(policy);
  try {
    return (await modalRef.result) as PolicyEditorResult;
  } catch {
    return null;
  }
}

/**
 * An insurance policy: what it covers, the premium, when it renews (with a reminder N days before, kept by the
 * server) and — once saved — the policy document and anything else linked to it.
 */
@Component({
  selector: 'app-policy-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="policy-editor-heading" class="modal-title h5">
          {{ policy() ? 'Edit policy' : 'Add a policy' }}
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
          <div class="col-sm-8">
            <label class="form-label" for="policy-name">Name</label>
            <input
              id="policy-name"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('name')"
              formControlName="name"
              placeholder="e.g. Family health cover"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('name'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="policy-kind">Kind</label>
            <select id="policy-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="policy-insurer">
              Insurer <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="policy-insurer"
              type="text"
              class="form-control"
              formControlName="insurer"
              placeholder="e.g. Star Health"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="policy-number">
              Policy number
              <span class="text-body-secondary small">(only the last 4 are kept)</span>
            </label>
            <input
              id="policy-number"
              type="text"
              class="form-control"
              formControlName="number"
              [placeholder]="
                policy()?.policyNumberLast4
                  ? '•••• ' + policy()!.policyNumberLast4
                  : 'e.g. P/2611/0045'
              "
              autocomplete="off"
            />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label" for="policy-currency">Currency</label>
            <ng-select
              labelForId="policy-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="Choose a currency"
              [clearable]="false"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="policy-cover">
              Cover <span class="text-body-secondary small">(sum assured)</span>
            </label>
            <input
              id="policy-cover"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('sumAssured')"
              formControlName="sumAssured"
              placeholder="e.g. 1000000"
            />
            @if (fieldError('sumAssured'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-4">
            <label class="form-label" for="policy-contact">
              Agent <span class="text-body-secondary small">(optional)</span>
            </label>
            <ng-select
              labelForId="policy-contact"
              formControlName="contactId"
              placeholder="Pick a contact (optional)"
            >
              @for (c of contacts(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="policy-premium">
              Premium <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="policy-premium"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('premium')"
              formControlName="premium"
              placeholder="e.g. 18000"
            />
            @if (fieldError('premium'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="policy-frequency">Paid</label>
            <select
              id="policy-frequency"
              class="form-select"
              [class.is-invalid]="fieldError('premiumFrequency')"
              formControlName="premiumFrequency"
            >
              <option [ngValue]="null" [selected]="form.controls.premiumFrequency.value === null">
                —
              </option>
              @for (f of frequencies; track f) {
                <option [ngValue]="f" [selected]="f === form.controls.premiumFrequency.value">
                  {{ frequencyLabels[f] }}
                </option>
              }
            </select>
            @if (fieldError('premiumFrequency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-4">
              <label class="form-label" [for]="'policy-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'policy-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="'Pick ' + d.label.toLowerCase()"
                  (click)="picker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError(d.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="form-check mb-0">
            <input
              id="policy-remind"
              type="checkbox"
              class="form-check-input"
              formControlName="remind"
            />
            <label class="form-check-label" for="policy-remind">Remind me</label>
          </div>
          <input
            type="number"
            min="0"
            max="365"
            class="form-control form-control-sm"
            style="width: 5.5rem"
            [class.is-invalid]="fieldError('reminderDays')"
            formControlName="reminderDays"
            placeholder="30"
            aria-label="Days before the renewal"
          />
          <span class="small">days before it renews</span>
          @if (fieldError('reminderDays'); as error) {
            <div class="invalid-feedback d-block w-100">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="policy-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="policy-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="Who's covered, waiting periods, claim helpline"
          ></textarea>
        </div>
        @if (policy(); as p) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the policy document (from Documents) so it's one click away at claim time.
            </p>
            <app-linked-items entityType="InsurancePolicy" [entityId]="p.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="InsurancePolicy"
              [entityId]="p.id"
              [entityTitle]="p.name"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (policy()) {
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
export class PolicyEditor {
  private readonly fb = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = POLICY_KINDS;
  protected readonly kindLabels = POLICY_KIND_LABELS;
  protected readonly frequencies = PREMIUM_FREQUENCIES;
  protected readonly frequencyLabels = PREMIUM_FREQUENCY_LABELS;
  protected readonly minDate = { year: 1960, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 60, month: 12, day: 31 };
  protected readonly dateFields = [
    { name: 'startDate', label: 'Started', placeholder: 'e.g. 01/Apr/2025' },
    { name: 'renewsOn', label: 'Renews on', placeholder: 'Next renewal' },
    { name: 'endsOn', label: 'Ends on', placeholder: 'Leave blank if it renews' },
  ] as const;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly contacts = toSignal(
    inject(ContactsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly policy = signal<InsurancePolicy | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    kind: this.fb.nonNullable.control<PolicyKind>('Health'),
    insurer: this.fb.nonNullable.control('', Validators.maxLength(200)),
    number: this.fb.nonNullable.control('', Validators.maxLength(100)),
    currency: this.fb.nonNullable.control('', Validators.required),
    sumAssured: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    premium: this.fb.control<number | null>(null, [
      Validators.min(0.01),
      Validators.max(999_999_999_999_999),
    ]),
    premiumFrequency: this.fb.control<PremiumFrequency | null>(null),
    startDate: this.fb.control<string | null>(null),
    renewsOn: this.fb.control<string | null>(null),
    endsOn: this.fb.control<string | null>(null),
    contactId: this.fb.control<number | null>(null),
    remind: this.fb.nonNullable.control(true),
    reminderDays: this.fb.control<number | null>(30, [Validators.min(0), Validators.max(365)]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(policy?: InsurancePolicy): void {
    this.policy.set(policy ?? null);
    this.form.reset({
      name: policy?.name ?? '',
      kind: policy?.kind ?? 'Health',
      insurer: policy?.insurer ?? '',
      number: '',
      currency: policy?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      sumAssured: policy?.sumAssured ?? null,
      premium: policy?.premium ?? null,
      premiumFrequency: policy?.premiumFrequency ?? null,
      startDate: policy?.startDate ?? null,
      renewsOn: policy?.renewsOn ?? null,
      endsOn: policy?.endsOn ?? null,
      contactId: policy?.contactId ?? null,
      remind: policy ? policy.renewalReminderDays !== null : true,
      reminderDays: policy?.renewalReminderDays ?? 30,
      notes: policy?.notes ?? '',
    });
  }

  protected fieldError(
    name:
      | 'name'
      | 'currency'
      | 'sumAssured'
      | 'premium'
      | 'premiumFrequency'
      | 'startDate'
      | 'renewsOn'
      | 'endsOn'
      | 'reminderDays',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'name':
        return control.errors['required']
          ? 'Name the policy (e.g. Family health cover).'
          : 'That is too long.';
      case 'currency':
        return 'Choose its currency.';
      case 'sumAssured':
      case 'premium':
        return 'Has to be more than zero — or leave it blank.';
      case 'premiumFrequency':
        return control.errors['required']
          ? 'Say how often it is paid.'
          : 'Leave blank without a premium.';
      case 'reminderDays':
        return control.errors['required'] ? 'How many days before?' : '0 to 365 days.';
      case 'renewsOn':
        return control.errors['needed']
          ? 'A reminder needs the renewal day.'
          : dateFieldError(control.errors);
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    // Clear what the last submit set by hand before checking again.
    this.form.controls.renewsOn.updateValueAndValidity();
    this.form.controls.reminderDays.updateValueAndValidity();
    const v = this.form.getRawValue();
    // The pairs the server insists on, said next to the right field.
    const frequency = this.form.controls.premiumFrequency;
    frequency.setErrors(
      v.premium !== null && !v.premiumFrequency
        ? { required: true }
        : v.premium === null && v.premiumFrequency
          ? { unexpected: true }
          : null,
    );
    if (v.remind && v.reminderDays === null) {
      this.form.controls.reminderDays.setErrors({ required: true });
    }
    if (v.remind && !v.renewsOn && !this.form.controls.renewsOn.errors) {
      this.form.controls.renewsOn.setErrors({ needed: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.financeService
      .savePolicy(this.policy()?.id ?? null, {
        name: v.name,
        kind: v.kind,
        insurer: v.insurer.trim() || null,
        // Blank keeps what's stored: the server only ever had the last 4.
        number: v.number.trim() || this.policy()?.policyNumberLast4 || null,
        currency: v.currency,
        sumAssured: v.sumAssured,
        premium: v.premium,
        premiumFrequency: v.premiumFrequency,
        startDate: v.startDate,
        renewsOn: v.renewsOn,
        endsOn: v.endsOn,
        contactId: v.contactId,
        notes: v.notes.trim() || null,
        renewalReminderDays: v.remind ? v.reminderDays : null,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (policy) => this.activeModal.close({ kind: 'saved', policy }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the policy.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const policy = this.policy();
    if (!policy) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${policy.name}"?`,
      text: 'Its renewal reminder goes too. A linked policy document stays in Documents.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removePolicy(policy.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the policy.')),
    });
  }
}
