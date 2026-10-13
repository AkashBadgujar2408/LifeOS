import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

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

interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: string[] | null;
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
    this.currentUserSignal.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private handleAuthResponse(response: ApiResponse<AuthResponseData>): void {
    if (!response.data) {
      return;
    }

    const { token, userId, username, email, displayName } = response.data;
    localStorage.setItem(TOKEN_KEY, token);
    const user: AuthUser = { userId, username, email, displayName };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  private loadStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw || !localStorage.getItem(TOKEN_KEY)) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
