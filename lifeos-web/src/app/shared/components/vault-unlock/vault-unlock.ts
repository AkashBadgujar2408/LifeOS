import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { apiErrorMessage } from '../../../core/services/api-error';
import { VaultService } from '../../../core/services/vault.service';

/**
 * Resolves true once the vault is unlocked — straight away if it already is, otherwise after the password is entered
 * again (false if the dialog is dismissed). `reason` says what's being opened.
 */
export async function ensureVaultUnlocked(
  modal: NgbModal,
  vault: VaultService,
  reason = 'This is in your vault.',
): Promise<boolean> {
  if (vault.isUnlocked()) {
    return true;
  }
  const modalRef = modal.open(VaultUnlockDialog, { ariaLabelledBy: 'vault-unlock-heading' });
  (modalRef.componentInstance as VaultUnlockDialog).reason.set(reason);
  try {
    return (await modalRef.result) === true;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-vault-unlock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="vault-unlock-heading" class="modal-title h5">
          <i class="bi bi-shield-lock" aria-hidden="true"></i> Unlock the vault
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body">
        <p class="small mb-3">
          {{ reason() }} Enter your password to go on — the vault then stays open for 15 minutes on
          this page, and every file you open is noted in Settings › Vault activity.
        </p>
        <label class="form-label" for="vault-password">Password</label>
        <input
          id="vault-password"
          type="password"
          class="form-control"
          formControlName="password"
          placeholder="Your LifeOS password"
          autocomplete="current-password"
          [class.is-invalid]="fieldError()"
          ngbAutofocus
        />
        @if (fieldError(); as error) {
          <div class="invalid-feedback d-block">{{ error }}</div>
        }
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="unlocking()">
          {{ unlocking() ? 'Unlocking...' : 'Unlock' }}
        </button>
      </div>
    </form>
  `,
})
export class VaultUnlockDialog {
  private readonly vault = inject(VaultService);
  protected readonly activeModal = inject(NgbActiveModal);

  readonly reason = signal('This is in your vault.');
  protected readonly unlocking = signal(false);
  private readonly serverError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', Validators.required],
  });

  constructor() {
    this.form.controls.password.valueChanges.subscribe(() => this.serverError.set(null));
  }

  protected fieldError(): string | null {
    const control = this.form.controls.password;
    if (this.serverError()) {
      return this.serverError();
    }
    return control.touched && control.hasError('required') ? 'Enter your password.' : null;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.unlocking.set(true);
    this.vault.unlockWith(this.form.getRawValue().password).subscribe({
      next: () => this.activeModal.close(true),
      error: (err) => {
        this.unlocking.set(false);
        this.serverError.set(apiErrorMessage(err, 'Could not unlock the vault.'));
      },
    });
  }
}
