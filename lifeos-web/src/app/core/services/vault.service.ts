import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { ApiResponse } from './api-response';
import { AuthService } from './auth.service';

/** Header the API reads the unlock from (VaultHeaders.Unlock). */
export const VAULT_UNLOCK_HEADER = 'X-Vault-Unlock';

export type VaultAction = 'Unlocked' | 'UnlockFailed' | 'Opened' | 'Unprotected';

export interface VaultAccess {
  id: number;
  action: VaultAction;
  entityType: string | null;
  entityId: number | null;
  /** The item's title now; null once it's deleted. */
  entityTitle: string | null;
  /** The file opened, when it was a file. */
  detail: string | null;
  clientAddress: string | null;
  createdAt: string;
}

interface VaultUnlock {
  token: string;
  expiresAtUtc: string;
}

/**
 * The vault's unlock: re-entering the password gives 15 minutes in which sensitive files open. The token lives only
 * in this service's memory — never in storage or a URL — so a reload, another tab or logging out starts locked.
 * Ask through `ensureVaultUnlocked` (shared/components/vault-unlock), which prompts only when needed.
 */
@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/Shared/Vault';

  private readonly unlock = signal<{ token: string; expiresAt: number } | null>(null);
  private lockTimer: ReturnType<typeof setTimeout> | null = null;

  /** When the unlock runs out (ms since epoch), or null while locked. Goes back to null on its own at that moment. */
  readonly unlockedUntil = computed(() => this.unlock()?.expiresAt ?? null);

  constructor() {
    const auth = inject(AuthService);
    effect(() => {
      if (!auth.isAuthenticated()) {
        this.lock();
      }
    });
  }

  isUnlocked(): boolean {
    const unlock = this.unlock();
    return unlock !== null && unlock.expiresAt > Date.now();
  }

  /** The unlock header for a request that touches the vault; empty while locked. */
  headers(): HttpHeaders {
    const unlock = this.unlock();
    return this.isUnlocked() && unlock
      ? new HttpHeaders({ [VAULT_UNLOCK_HEADER]: unlock.token })
      : new HttpHeaders();
  }

  unlockWith(password: string): Observable<void> {
    return this.http.post<ApiResponse<VaultUnlock>>(`${this.baseUrl}/unlock`, { password }).pipe(
      tap((response) => {
        const data = response.data!;
        // Counted on this device's clock from now, so a skewed clock can't keep it open longer than the server does.
        const lifetime = Math.max(0, Date.parse(data.expiresAtUtc) - Date.now());
        this.set({ token: data.token, expiresAt: Date.now() + Math.min(lifetime, 15 * 60_000) });
      }),
      map(() => undefined),
    );
  }

  lock(): void {
    this.set(null);
  }

  activity(): Observable<VaultAccess[]> {
    return this.http
      .get<ApiResponse<VaultAccess[]>>(`${this.baseUrl}/activity`)
      .pipe(map((response) => response.data ?? []));
  }

  private set(unlock: { token: string; expiresAt: number } | null): void {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    this.unlock.set(unlock);
    if (unlock) {
      this.lockTimer = setTimeout(() => this.lock(), unlock.expiresAt - Date.now());
    }
  }
}
