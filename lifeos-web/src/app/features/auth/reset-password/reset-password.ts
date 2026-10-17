import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { apiErrorMessage } from '../../../core/services/api-error';
import { AuthLayout } from '../../../shared/components/auth-layout/auth-layout';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

type FieldName = 'username' | 'recoveryCode' | 'newPassword' | 'confirmPassword';

/** Forgotten password: username + one recovery code + a new password, then straight in. */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      username: ['', Validators.required],
      recoveryCode: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected fieldError(name: FieldName): string | null {
    const control = this.form.controls[name];
    if (!control.touched) {
      return null;
    }
    if (control.errors?.['required']) {
      return {
        username: 'Enter your username.',
        recoveryCode: 'Enter one of your recovery codes.',
        newPassword: 'Choose a new password.',
        confirmPassword: 'Type the new password again.',
      }[name];
    }
    if (control.errors?.['minlength']) {
      return 'Use at least 8 characters.';
    }
    if (name === 'confirmPassword' && this.form.errors?.['passwordMismatch']) {
      return "The two passwords don't match.";
    }
    return null;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { username, recoveryCode, newPassword } = this.form.getRawValue();
    this.submitting.set(true);
    this.authService
      .resetPassword({ username: username.trim(), recoveryCode, newPassword })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          const left = response.data?.recoveryCodesLeft ?? 0;
          this.toast.success(
            left === 0
              ? 'Password changed. That was your last recovery code — make a new set in Settings.'
              : `Password changed. ${left} recovery ${left === 1 ? 'code' : 'codes'} left.`,
          );
          this.router.navigateByUrl(left === 0 ? '/settings' : '/');
        },
        error: (err) => {
          this.submitting.set(false);
          this.toast.error(apiErrorMessage(err, "Couldn't reset the password."));
        },
      });
  }
}
