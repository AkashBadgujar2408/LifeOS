import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { Certification, LearningService } from '../../core/services/learning.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { expiryStatus } from '../documents/document-view';
import { openCertificationEditor } from './certification-editor';

/** Certifications, expiring soonest first, with the same expiry badges as documents. */
@Component({
  selector: 'app-certifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Certifications</h1>
          <p class="text-body-secondary mb-0 small">
            What you've earned, and a reminder before any of it runs out.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> New certification
        </button>
      </div>

      @if (loadFailed() && !certifications()) {
        <app-load-error message="Couldn't load your certifications." (retry)="load()" />
      } @else if (certifications(); as certifications) {
        @if (certifications.length === 0) {
          <section class="card">
            <div class="card-body p-4">
              <h2 class="h5">No certifications yet</h2>
              <p class="text-body-secondary">
                Add one with its expiry date and LifeOS reminds you in time to renew it.
              </p>
              <button type="button" class="btn btn-outline-primary" (click)="open()">
                <i class="bi bi-plus-lg"></i> Add a certification
              </button>
            </div>
          </section>
        }
        <div class="row row-cols-1 row-cols-md-2 g-3">
          @for (cert of certifications; track cert.id) {
            @let expiry = expiryStatus(cert.expiresOn, today);
            <div class="col">
              <div class="card h-100">
                <div class="card-body d-flex flex-column gap-1">
                  <button
                    type="button"
                    class="btn btn-link p-0 stretched-link link-body-emphasis text-decoration-none fw-semibold text-break text-start"
                    (click)="open(cert)"
                  >
                    {{ cert.name }}
                  </button>
                  <div class="small text-body-secondary text-break">
                    {{ cert.issuer ?? 'Issuer not given' }} · issued {{ cert.issuedOn | date }}
                    @if (cert.skillName) {
                      · <i class="bi bi-mortarboard" aria-hidden="true"></i> {{ cert.skillName }}
                    }
                  </div>
                  <div class="d-flex flex-wrap align-items-center gap-2 mt-auto pt-1">
                    @switch (expiry.state) {
                      @case ('expired') {
                        <span class="badge expiry-badge expiry-expired">{{ expiry.label }}</span>
                      }
                      @case ('today') {
                        <span class="badge expiry-badge expiry-expired">{{ expiry.label }}</span>
                      }
                      @case ('soon') {
                        <span class="badge expiry-badge expiry-soon">{{ expiry.label }}</span>
                      }
                      @case ('valid') {
                        <span class="small text-body-secondary">
                          Valid until {{ cert.expiresOn | date }}
                        </span>
                      }
                      @default {
                        <span class="small text-body-secondary">Doesn't expire</span>
                      }
                    }
                    @if (cert.renewalReminderDays !== null) {
                      <span class="small text-body-secondary">
                        <i class="bi bi-bell" aria-hidden="true"></i>
                        {{ cert.renewalReminderDays }} days before
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="text-body-secondary">Loading certifications...</p>
      }
    </div>
  `,
})
export class Certifications {
  private readonly learningService = inject(LearningService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly expiryStatus = expiryStatus;
  protected readonly today = todayIso();
  protected readonly certifications = signal<Certification[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.learningService
      .certifications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (certifications) => {
          this.certifications.set(certifications);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async open(certification?: Certification): Promise<void> {
    const result = await openCertificationEditor(this.modal, certification);
    if (result) {
      this.toast.success(
        result.kind === 'saved' ? 'Certification saved.' : 'Certification deleted.',
      );
      this.load();
    }
  }
}
