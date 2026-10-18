import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CareerService, ResumeVersion } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { Attachments } from '../../shared/components/attachments/attachments';
import { LoadError } from '../../shared/components/load-error/load-error';
import { STAGE_LABELS } from './career-view';
import { openResumeEditor } from './resume-editor';

/** Resume versions, newest first: each one's file(s) and which applications it went out with. */
@Component({
  selector: 'app-career-resumes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Attachments, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Resumes</h1>
          <p class="text-body-secondary mb-0 small">
            Every version you send out, with the file, so you always know which one a recruiter has
            in front of them.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> New version
        </button>
      </div>

      @if (loadFailed() && !resumes()) {
        <app-load-error message="Couldn't load your resume versions." (retry)="load()" />
      } @else if (resumes(); as resumes) {
        @if (resumes.length === 0) {
          <p class="text-body-secondary">
            No versions yet. Add the one you're sending now and attach its file; when you tailor it
            for a role, save that as a new version.
          </p>
        }
        <div class="d-flex flex-column gap-3">
          @for (r of resumes; track r.id) {
            <section
              class="card"
              [id]="'resume-' + r.id"
              [attr.aria-labelledby]="'resume-h-' + r.id"
            >
              <div class="card-body">
                <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div class="min-w-0">
                    <h2 [id]="'resume-h-' + r.id" class="h5 mb-1 text-break">{{ r.name }}</h2>
                    <div class="small text-body-secondary">
                      Added {{ r.createdAt | date }}
                      @if (r.targetRole) {
                        · for {{ r.targetRole }}
                      }
                    </div>
                  </div>
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="edit(r)">
                    <i class="bi bi-pencil"></i> Edit
                  </button>
                </div>
                @if (r.notes) {
                  <p class="small mt-2 mb-0 text-break" style="white-space: pre-line">
                    {{ r.notes }}
                  </p>
                }
                <div class="border-top mt-3 pt-3">
                  <app-attachments entityType="ResumeVersion" [entityId]="r.id" label="File" />
                </div>
                <div class="border-top mt-3 pt-3">
                  <h3 class="h6">Sent with</h3>
                  <ul class="list-unstyled mb-0 small d-flex flex-column gap-1">
                    @for (a of r.applications; track a.id) {
                      <li>
                        <a [routerLink]="['/career/applications', a.id]"
                          >{{ a.role }} at {{ a.organisation }}</a
                        >
                        <span class="text-body-secondary">
                          · {{ stageLabels[a.stage] }}
                          @if (a.appliedOn) {
                            · applied {{ a.appliedOn | date }}
                          }
                        </span>
                      </li>
                    } @empty {
                      <li class="text-body-secondary">
                        No applications yet — pick it as "Resume sent" on an application.
                      </li>
                    }
                  </ul>
                </div>
              </div>
            </section>
          }
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class CareerResumes {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly stageLabels = STAGE_LABELS;
  protected readonly resumes = signal<ResumeVersion[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.careerService
      .resumes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resumes) => {
          this.resumes.set(resumes);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(resume?: ResumeVersion): Promise<void> {
    const result = await openResumeEditor(this.modal, resume);
    if (result) {
      this.toast.success(
        result.kind === 'saved' ? 'Resume version saved.' : 'Resume version deleted.',
      );
      this.load();
    }
  }
}
