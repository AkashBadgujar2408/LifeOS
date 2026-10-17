import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthLayout } from '../../../shared/components/auth-layout/auth-layout';
import { RecoveryCodes } from '../../../shared/components/recovery-codes/recovery-codes';
import { apiErrorMessage } from '../../../core/services/api-error';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

type FieldName = 'displayName' | 'username' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, RecoveryCodes],
  templateUrl: './register.html',
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  /** Set once the account exists: its recovery codes, shown before going in. */
  protected readonly recoveryCodes = signal<string[] | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      displayName: ['', Validators.required],
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  protected fieldError(name: FieldName): string | null {
    const control = this.form.get(name);
    if (!control || !control.touched) {
      return null;
    }

    if (control.errors?.['required']) {
      return 'This field is required.';
    }
    if (control.errors?.['minlength']) {
      const requiredLength = control.errors['minlength'].requiredLength;
      return `Must be at least ${requiredLength} characters.`;
    }
    if (control.errors?.['email']) {
      return 'Enter a valid email address.';
    }
    if (name === 'confirmPassword' && this.form.errors?.['passwordMismatch'] && control.value) {
      return 'Passwords do not match.';
    }

    return null;
  }

  protected continueToApp(): void {
    this.router.navigateByUrl('/');
  }

  protected username(): string {
    return this.form.controls.username.value;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { displayName, username, email, password } = this.form.getRawValue();

    this.submitting.set(true);
    this.authService.register({ displayName, username, email, password }).subscribe({
      next: (response) => {
        this.submitting.set(false);
        const codes = response.data?.recoveryCodes;
        if (codes?.length) {
          this.recoveryCodes.set(codes);
        } else {
          this.router.navigateByUrl('/');
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Registration failed.'));
      },
    });
  }
}
