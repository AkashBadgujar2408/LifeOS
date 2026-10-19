import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { browserTimeZone } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { AuthService } from '../../core/services/auth.service';
import { LifeAreasService } from '../../core/services/life-areas.service';
import {
  MODULES,
  ModuleKey,
  PreferencesPayload,
  SettingsService,
  UserSettings,
} from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { YourData } from './your-data';
import { RecoveryCodes } from '../../shared/components/recovery-codes/recovery-codes';
import { VaultActivity } from './vault-activity';
import { ExchangeRates } from '../finance/exchange-rates';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

/** Every IANA zone the browser knows, for the timezone picker. */
function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/**
 * Settings: profile, timezone and currency, which modules and life areas are switched on, password, and recovery
 * codes. Module and life-area switches save as they're flipped; the forms save with their own button.
 */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LoadError, RecoveryCodes, VaultActivity, ExchangeRates, YourData],
  templateUrl: './settings.html',
})
export class Settings {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  protected readonly financeOn = computed(
    () => !this.settingsService.hiddenModules().has('Finance'),
  );
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly modules = MODULES;
  protected readonly deviceZone = browserTimeZone();
  protected readonly timeZones = allTimeZones();
  protected readonly currencies = toSignal(this.settingsService.currencies(), {
    initialValue: [],
  });
  protected readonly lifeAreas = toSignal(inject(LifeAreasService).list(), { initialValue: [] });

  protected readonly settings = this.settingsService.settings;
  protected readonly loadFailed = signal(false);
  protected readonly savingProfile = signal(false);
  protected readonly savingPreferences = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly makingCodes = signal(false);
  /** A set just made: shown once. */
  protected readonly newCodes = signal<string[] | null>(null);

  protected readonly hiddenModules = this.settingsService.hiddenModules;
  protected readonly hiddenAreas = this.settingsService.hiddenLifeAreaIds;
  /** The last life area switched on can't be switched off (goals need one). */
  protected readonly areasOn = computed(
    () => this.lifeAreas().filter((a) => !this.hiddenAreas().has(a.id)).length,
  );

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
  });

  protected readonly preferencesForm = this.fb.group({
    timeZone: this.fb.control<string | null>(null),
    baseCurrency: this.fb.control<string | null>(null),
  });

  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly codesForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.settingsService.load().subscribe({
      next: (settings) => {
        this.loadFailed.set(false);
        this.fillForms(settings);
      },
      error: (err) => {
        this.loadFailed.set(true);
        this.toast.error(apiErrorMessage(err, "Couldn't load your settings."));
      },
    });
  }

  private fillForms(settings: UserSettings): void {
    this.profileForm.reset({ displayName: settings.displayName, email: settings.email });
    this.preferencesForm.reset({
      timeZone: settings.timeZone,
      baseCurrency: settings.baseCurrency,
    });
  }

  protected profileError(name: 'displayName' | 'email'): string | null {
    const control = this.profileForm.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return name === 'displayName' ? 'Give yourself a display name.' : 'Enter your email.';
    }
    if (control.errors['email']) {
      return 'Enter a valid email address.';
    }
    return name === 'displayName'
      ? 'Keep the name under 200 characters.'
      : 'Keep the email under 256 characters.';
  }

  protected passwordError(
    name: 'currentPassword' | 'newPassword' | 'confirmPassword',
  ): string | null {
    const control = this.passwordForm.controls[name];
    if (!control.touched) {
      return null;
    }
    if (control.errors?.['required']) {
      return {
        currentPassword: 'Enter your current password.',
        newPassword: 'Choose a new password.',
        confirmPassword: 'Type the new password again.',
      }[name];
    }
    if (control.errors?.['minlength']) {
      return 'Use at least 8 characters.';
    }
    if (name === 'confirmPassword' && this.passwordForm.errors?.['passwordMismatch']) {
      return "The two passwords don't match.";
    }
    return null;
  }

  protected codesError(): string | null {
    const control = this.codesForm.controls.currentPassword;
    return control.touched && control.errors?.['required'] ? 'Enter your current password.' : null;
  }

  protected saveProfile(): void {
    const form = this.profileForm;
    form.controls.displayName.setValue(form.controls.displayName.value.trim());
    form.controls.email.setValue(form.controls.email.value.trim());
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const { displayName, email } = form.getRawValue();
    this.savingProfile.set(true);
    this.settingsService.updateProfile(displayName, email).subscribe({
      next: (settings) => {
        this.savingProfile.set(false);
        this.authService.updateProfile(settings.displayName, settings.email);
        form.markAsPristine();
        this.toast.success('Profile saved.');
      },
      error: (err) => {
        this.savingProfile.set(false);
        this.toast.error(apiErrorMessage(err, "Couldn't save your profile."));
      },
    });
  }

  protected savePreferences(): void {
    const { timeZone, baseCurrency } = this.preferencesForm.getRawValue();
    this.savingPreferences.set(true);
    this.save({ timeZone, baseCurrency }, 'Preferences saved.', () => {
      this.savingPreferences.set(false);
      this.preferencesForm.markAsPristine();
    });
  }

  protected isModuleOn(key: ModuleKey): boolean {
    return !this.hiddenModules().has(key);
  }

  protected toggleModule(key: ModuleKey, on: boolean): void {
    const hidden = new Set(this.hiddenModules());
    if (on) {
      hidden.delete(key);
    } else {
      hidden.add(key);
    }
    const label = this.modules.find((m) => m.key === key)!.label;
    this.save({ hiddenModules: [...hidden] }, on ? `${label} is back.` : `${label} is hidden.`);
  }

  protected toggleArea(id: number, on: boolean): void {
    const hidden = new Set(this.hiddenAreas());
    if (on) {
      hidden.delete(id);
    } else {
      hidden.add(id);
    }
    const name = this.lifeAreas().find((a) => a.id === id)?.name ?? 'Life area';
    this.save({ hiddenLifeAreaIds: [...hidden] }, on ? `${name} is back.` : `${name} is hidden.`);
  }

  /** The preferences endpoint takes everything at once: the stored values, with this change on top. */
  private save(change: Partial<PreferencesPayload>, message: string, done?: () => void): void {
    const current = this.settings();
    if (!current) {
      return;
    }
    const payload: PreferencesPayload = {
      timeZone: current.timeZone,
      baseCurrency: current.baseCurrency,
      hiddenModules: current.hiddenModules,
      hiddenLifeAreaIds: current.hiddenLifeAreaIds,
      ...change,
    };
    this.settingsService.updatePreferences(payload).subscribe({
      next: () => {
        done?.();
        this.toast.success(message);
      },
      error: (err) => {
        done?.();
        this.toast.error(apiErrorMessage(err, "Couldn't save that."));
      },
    });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.settingsService.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset();
        this.toast.success('Password changed.');
      },
      error: (err) => {
        this.savingPassword.set(false);
        this.toast.error(apiErrorMessage(err, "Couldn't change the password."));
      },
    });
  }

  protected makeNewCodes(): void {
    if (this.codesForm.invalid) {
      this.codesForm.markAllAsTouched();
      return;
    }

    this.makingCodes.set(true);
    this.settingsService
      .regenerateRecoveryCodes(this.codesForm.getRawValue().currentPassword)
      .subscribe({
        next: (codes) => {
          this.makingCodes.set(false);
          this.codesForm.reset();
          this.newCodes.set(codes);
        },
        error: (err) => {
          this.makingCodes.set(false);
          this.toast.error(apiErrorMessage(err, "Couldn't make new codes."));
        },
      });
  }
}
