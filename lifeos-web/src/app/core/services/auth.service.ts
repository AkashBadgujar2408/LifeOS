import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ApiResponse } from './api-response';

export interface AuthUser {
  userId: number;
  username: string;
  email: string;
  displayName: string;
}

interface AuthResponseData extends AuthUser {
  token: string;
  expiresAtUtc: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

const TOKEN_KEY = 'lifeos.token';
const USER_KEY = 'lifeos.user';
const EXPIRES_KEY = 'lifeos.expiresAt';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUserSignal = signal<AuthUser | null>(this.loadStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  register(payload: RegisterPayload): Observable<ApiResponse<AuthResponseData>> {
    return this.http
      .post<ApiResponse<AuthResponseData>>('/api/Shared/Auth/register', payload)
      .pipe(tap((response) => this.handleAuthResponse(response)));
  }

  login(payload: LoginPayload): Observable<ApiResponse<AuthResponseData>> {
    return this.http
      .post<ApiResponse<AuthResponseData>>('/api/Shared/Auth/login', payload)
      .pipe(tap((response) => this.handleAuthResponse(response)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    this.currentUserSignal.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private handleAuthResponse(response: ApiResponse<AuthResponseData>): void {
    if (!response.data) {
      return;
    }

    const { token, expiresAtUtc, userId, username, email, displayName } = response.data;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRES_KEY, expiresAtUtc);
    const user: AuthUser = { userId, username, email, displayName };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  private loadStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw || !localStorage.getItem(TOKEN_KEY)) {
      return null;
    }
    // A login that has already run out would only fail every request: start logged out instead.
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      // Runs while the signal itself is being created, so clear storage directly rather than via logout().
      [TOKEN_KEY, USER_KEY, EXPIRES_KEY].forEach((key) => localStorage.removeItem(key));
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
