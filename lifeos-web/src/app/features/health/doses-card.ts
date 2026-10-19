import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { todayIso } from '../../core/dates/today';
import { DoseSummary, HealthService } from '../../core/services/health.service';
import { TodaysDoses } from './todays-doses';

/**
 * My Day's medicines card. Locked, it shows only counts ("2 of 3 doses marked") — never names — with an Unlock
 * button; unlocked it becomes the tick list. Nothing at all when no dose is due today.
 */
@Component({
  selector: 'app-doses-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TodaysDoses],
  template: `
    @if (summary(); as s) {
      @if (s.due > 0) {
        <section class="card" aria-labelledby="doses-heading">
          <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h2 id="doses-heading" class="h5 mb-0">
                <i class="bi bi-capsule" aria-hidden="true"></i> Medicines
              </h2>
              <a class="small" routerLink="/health/medications">All medicines</a>
            </div>
            @if (open()) {
              <app-todays-doses (changed)="summary.set($event)" />
            } @else {
              <p class="small mb-2">
                {{ s.done }} of {{ s.due }} {{ s.due === 1 ? 'dose' : 'doses' }} marked today.
              </p>
              <button type="button" class="btn btn-sm btn-outline-primary" (click)="unlock()">
                <i class="bi bi-shield-lock" aria-hidden="true"></i> Unlock to see and tick them
              </button>
            }
          </div>
        </section>
      }
    }
  `,
})
export class DosesCard {
  private readonly healthService = inject(HealthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly summary = signal<DoseSummary | null>(null);
  protected readonly open = signal(this.healthService.isUnlocked());

  constructor() {
    this.healthService
      .doseSummary(todayIso())
      .pipe(takeUntilDestroyed(this.destroyRef))
      // A failure just leaves the card out; My Day has its own load error.
      .subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.summary.set(null),
      });
  }

  protected async unlock(): Promise<void> {
    if (await this.healthService.unlock()) {
      this.open.set(true);
    }
  }
}
