import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  DISPOSAL_KINDS,
  DisposalKind,
  DisposalPayload,
  HomeService,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { DISPOSAL_KIND_LABELS } from './home-view';

/** What's being let go: a belonging or a vehicle, with what the dialog needs to know about it. */
export interface DisposalTarget {
  type: 'Asset' | 'Vehicle';
  id: number;
  name: string;
  /** Its currency (bought for…), which a sale must be in. */
  currency: string | null;
  purchasedOn: string | null;
}

/** Opens "Let go"; resolves true once it's recorded, null if dismissed. */
export async function openDisposal(modal: NgbModal, target: DisposalTarget): Promise<true | null> {
  const modalRef = modal.open(DisposalDialog, { ariaLabelledBy: 'disposal-heading' });
  (modalRef.componentInstance as DisposalDialog).configure(target);
  try {
    return (await modalRef.result) as true;
  } catch {
    return null;
  }
}

/** Sold, donated, thrown away or lost on a day — it leaves the inventory but stays in your history. */
@Component({
  selector: 'app-disposal-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="disposal-heading" class="modal-title h5">Let go of {{ target()?.name }}</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <fieldset>
          <legend class="form-label fs-6">What happened to it</legend>
          <div class="d-flex flex-wrap gap-3">
            @for (kind of kinds; track kind) {
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  [id]="'disposal-' + kind"
                  [value]="kind"
                  formControlName="kind"
                />
                <label class="form-check-label" [for]="'disposal-' + kind">{{
                  kindLabels[kind]
                }}</label>
              </div>
            }
          </div>
        </fieldset>
        <div>
          <label class="form-label" for="disposal-on">When</label>
          <div class="input-group">
            <input
              id="disposal-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('on')"
              formControlName="on"
              placeholder="e.g. 20/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #picker="ngbDatepicker"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day"
              (click)="picker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fieldError('on'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        @if (form.controls.kind.value === 'Sold') {
          <div>
            <label class="form-label" for="disposal-amount">
              Sold for <span class="text-body-secondary small">({{ currency() }}, optional)</span>
            </label>
            <input
              id="disposal-amount"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('amount')"
              formControlName="amount"
              placeholder="e.g. 18000"
            />
            @if (fieldError('amount'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <p class="small text-body-secondary mb-0">
          It leaves your inventory and its reminders stop; you can take it back later.
        </p>
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
export class DisposalDialog {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = DISPOSAL_KINDS;
  protected readonly kindLabels = DISPOSAL_KIND_LABELS;
  protected readonly target = signal<DisposalTarget | null>(null);
  protected readonly currency = signal('');
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    kind: this.fb.nonNullable.control<DisposalKind>('Sold'),
    on: this.fb.control<string | null>(todayIso(), Validators.required),
    amount: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
  });

  configure(target: DisposalTarget): void {
    this.target.set(target);
    this.currency.set(target.currency ?? this.settingsService.settings()?.baseCurrency ?? 'INR');
  }

  protected fieldError(name: 'on' | 'amount'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (name === 'amount') {
      return 'Can’t be negative — or leave it blank.';
    }
    return control.errors['required']
      ? 'Say when.'
      : control.errors['future']
        ? 'That can’t be in the future.'
        : control.errors['beforeBought']
          ? 'That’s before it was bought.'
          : dateFieldError(control.errors);
  }

  protected submit(): void {
    const target = this.target();
    if (!target) {
      return;
    }
    this.form.controls.on.updateValueAndValidity();
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.on && v.on > today) {
      this.form.controls.on.setErrors({ future: true });
    } else if (v.on && target.purchasedOn && v.on < target.purchasedOn) {
      this.form.controls.on.setErrors({ beforeBought: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const sold = v.kind === 'Sold' && v.amount !== null;
    const payload: DisposalPayload = {
      kind: v.kind,
      on: v.on,
      amount: sold ? v.amount : null,
      currency: sold ? this.currency() : null,
      today,
    };
    const request: Observable<unknown> =
      target.type === 'Asset'
        ? this.homeService.setAssetDisposal(target.id, payload)
        : this.homeService.setVehicleDisposal(target.id, payload);
    this.saving.set(true);
    request.subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save that.'));
      },
    });
  }
}

/** Takes something let go back into the inventory (kind null). */
export function takeBack(
  homeService: HomeService,
  type: 'Asset' | 'Vehicle',
  id: number,
): Observable<unknown> {
  const payload: DisposalPayload = {
    kind: null,
    on: null,
    amount: null,
    currency: null,
    today: todayIso(),
  };
  return type === 'Asset'
    ? homeService.setAssetDisposal(id, payload)
    : homeService.setVehicleDisposal(id, payload);
}
