import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { browserTimeZone } from '../dates/today';

/** Modules that can be switched off; same keys as the API (never rename one). */
export type ModuleKey =
  | 'Calendar'
  | 'Reminders'
  | 'Goals'
  | 'Tasks'
  | 'Projects'
  | 'Habits'
  | 'Journal'
  | 'Story'
  | 'Documents'
  | 'Learning'
  | 'Career'
  | 'Finance';

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  /** What switching it off takes away, for the Settings page. */
  hides: string;
}

export const MODULES: ModuleInfo[] = [
  { key: 'Calendar', label: 'Calendar', hides: 'its page and the events on My Day' },
  { key: 'Reminders', label: 'Reminders', hides: 'its page and the reminders card on My Day' },
  { key: 'Goals', label: 'Goals', hides: 'its page and "Goals in motion" on My Day' },
  { key: 'Tasks', label: 'Tasks', hides: 'its page and the tasks card on My Day' },
  { key: 'Projects', label: 'Projects', hides: 'its page' },
  { key: 'Habits', label: 'Habits', hides: 'its page and the habits card on My Day' },
  { key: 'Journal', label: 'Journal', hides: 'its page and the journal card on My Day' },
  {
    key: 'Learning',
    label: 'Learning',
    hides: 'Skills, Courses, Reading, Roadmaps, Study, Notes and Certifications',
  },
  {
    key: 'Career',
    label: 'Career',
    hides: 'the career timeline, salary history and achievements',
  },
  {
    key: 'Finance',
    label: 'Finance',
    hides: 'Accounts and Transactions, and "Log an expense" in Quick Add',
  },
  {
    key: 'Documents',
    label: 'Documents',
    hides: 'its page and "Documents expiring" on My Day',
  },
  {
    key: 'Story',
    label: 'Story Mode',
    hides: 'Story, Missions, Life areas and Achievements, and the recap on My Day',
  },
];

export interface UserSettings {
  username: string;
  email: string;
  displayName: string;
  /** IANA zone repeating events and reminders follow; null = this device's. */
  timeZone: string | null;
  baseCurrency: string | null;
  hiddenModules: ModuleKey[];
  hiddenLifeAreaIds: number[];
  recoveryCodesLeft: number;
}

export interface PreferencesPayload {
  timeZone: string | null;
  baseCurrency: string | null;
  hiddenModules: ModuleKey[];
  hiddenLifeAreaIds: number[];
}

export interface Currency {
  code: string;
  name: string;
}

/**
 * The logged-in user's settings. The shell loads them once (`load()`), so the navigation, My Day and the life-area
 * pickers can read what's switched off from `hiddenModules` / `hiddenLifeAreaIds` without asking again. Until they
 * arrive nothing counts as hidden — a failed load just shows everything.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/Settings';

  private readonly settingsSignal = signal<UserSettings | null>(null);
  readonly settings = this.settingsSignal.asReadonly();

  readonly hiddenModules = computed<ReadonlySet<ModuleKey>>(
    () => new Set(this.settingsSignal()?.hiddenModules ?? []),
  );
  readonly hiddenLifeAreaIds = computed<ReadonlySet<number>>(
    () => new Set(this.settingsSignal()?.hiddenLifeAreaIds ?? []),
  );

  private readonly currencies$ = this.http
    .get<ApiResponse<Currency[]>>(`${this.baseUrl}/currencies`)
    .pipe(
      map((response) => response.data ?? []),
      shareReplay(1),
    );

  /** Fetches the settings (shell start, Settings page). Errors are left to the caller. */
  load(): Observable<UserSettings> {
    return this.http.get<ApiResponse<UserSettings>>(this.baseUrl).pipe(
      map((response) => response.data!),
      tap((settings) => this.settingsSignal.set(settings)),
    );
  }

  /** On logout: the next user starts from nothing hidden. */
  reset(): void {
    this.settingsSignal.set(null);
  }

  /** The zone a new repeating event or reminder should follow: the chosen one, else this device's. */
  preferredTimeZone(): string {
    return this.settingsSignal()?.timeZone ?? browserTimeZone();
  }

  updateProfile(displayName: string, email: string): Observable<UserSettings> {
    return this.http
      .put<ApiResponse<UserSettings>>(`${this.baseUrl}/profile`, { displayName, email })
      .pipe(
        map((response) => response.data!),
        tap((settings) => this.settingsSignal.set(settings)),
      );
  }

  updatePreferences(payload: PreferencesPayload): Observable<UserSettings> {
    return this.http.put<ApiResponse<UserSettings>>(`${this.baseUrl}/preferences`, payload).pipe(
      map((response) => response.data!),
      tap((settings) => this.settingsSignal.set(settings)),
    );
  }

  currencies(): Observable<Currency[]> {
    return this.currencies$;
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .put<ApiResponse<boolean>>('/api/Shared/Auth/password', { currentPassword, newPassword })
      .pipe(map(() => undefined));
  }

  /** A new set of recovery codes (the old set stops working). */
  regenerateRecoveryCodes(currentPassword: string): Observable<string[]> {
    return this.http
      .post<ApiResponse<{ codes: string[] }>>('/api/Shared/Auth/recovery-codes', {
        currentPassword,
      })
      .pipe(
        map((response) => response.data?.codes ?? []),
        tap((codes) =>
          this.settingsSignal.update((s) => (s ? { ...s, recoveryCodesLeft: codes.length } : s)),
        ),
      );
  }
}
