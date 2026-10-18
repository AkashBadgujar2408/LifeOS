import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import {
  APPLICATION_STAGES,
  ApplicationStage,
  CareerService,
  JobApplication,
} from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openApplicationEditor } from './application-editor';
import { STAGE_ICONS, STAGE_LABELS, STAGE_MOVE_LABELS, boardColumns } from './career-view';
import { openStageMove } from './stage-move-dialog';

/**
 * Job applications as a board, one column per stage (closed ones together at the end). Each card moves to another
 * stage from its menu — the move asks for the day, so the history stays true — and opens its page.
 */
@Component({
  selector: 'app-career-applications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    LoadError,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
  ],
  template: `
    <div class="container-fluid py-4 px-3 px-lg-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Applications</h1>
          <p class="text-body-secondary mb-0 small">
            Every job you're after, by where it stands. Moving one to Interviewing puts the round on
            your calendar.
          </p>
        </div>
        <div class="d-flex gap-2">
          <a class="btn btn-outline-secondary" routerLink="/career/questions">
            <i class="bi bi-chat-square-quote"></i> Question bank
          </a>
          <button type="button" class="btn btn-primary" (click)="create()">
            <i class="bi bi-plus-lg"></i> New application
          </button>
        </div>
      </div>

      @if (loadFailed() && !applications()) {
        <app-load-error message="Couldn't load your applications." (retry)="load()" />
      } @else if (applications(); as applications) {
        @if (applications.length === 0) {
          <p class="text-body-secondary">
            No applications yet. Save the next posting that catches your eye — even before you apply
            — so nothing slips.
          </p>
        }
        <div class="row row-cols-1 row-cols-md-2 row-cols-xl-5 g-3">
          @for (column of columns(); track column.key) {
            <section class="col" [attr.aria-labelledby]="'column-' + column.key">
              <h2
                [id]="'column-' + column.key"
                class="h6 d-flex align-items-center gap-2 text-body-secondary mb-2"
              >
                {{ column.label }}
                <span class="badge rounded-pill text-bg-light border">{{
                  column.applications.length
                }}</span>
              </h2>
              <div class="d-flex flex-column gap-2">
                @for (a of column.applications; track a.id) {
                  <article class="card">
                    <div class="card-body p-3">
                      <div class="d-flex align-items-start gap-2">
                        <div class="min-w-0 flex-grow-1">
                          <a
                            class="fw-semibold link-body-emphasis text-decoration-none text-break"
                            [routerLink]="['/career/applications', a.id]"
                            >{{ a.role }}</a
                          >
                          <div class="small text-body-secondary text-break">
                            {{ a.organisation }}
                          </div>
                        </div>
                        <div ngbDropdown container="body" placement="bottom-end">
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            ngbDropdownToggle
                            [attr.aria-label]="'Move ' + a.role + ' at ' + a.organisation"
                          >
                            Move
                          </button>
                          <div ngbDropdownMenu>
                            @for (stage of stages; track stage) {
                              @if (stage !== a.stage) {
                                <button type="button" ngbDropdownItem (click)="move(a, stage)">
                                  <i class="bi {{ stageIcons[stage] }} me-2"></i
                                  >{{ moveLabels[stage] }}
                                </button>
                              }
                            }
                          </div>
                        </div>
                      </div>
                      <div class="small mt-2 d-flex flex-column gap-1">
                        @if (column.key === 'Closed') {
                          <span>
                            <i class="bi {{ stageIcons[a.stage] }} me-1"></i
                            >{{ stageLabels[a.stage] }} · {{ a.closedOn | date }}
                          </span>
                        } @else if (a.nextInterviewAt) {
                          <span class="text-body-emphasis">
                            <i class="bi bi-calendar-event me-1"></i
                            >{{ a.nextInterviewAt | date: dateTimeFormat }}
                          </span>
                        }
                        @if (a.appliedOn && column.key !== 'Closed') {
                          <span class="text-body-secondary">Applied {{ a.appliedOn | date }}</span>
                        } @else if (column.key === 'Saved' && a.stageSince) {
                          <span class="text-body-secondary">Saved {{ a.stageSince | date }}</span>
                        }
                      </div>
                    </div>
                  </article>
                } @empty {
                  <p class="small text-body-secondary mb-0">Nothing here.</p>
                }
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
export class CareerApplications {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly stages = APPLICATION_STAGES;
  protected readonly stageLabels = STAGE_LABELS;
  protected readonly moveLabels = STAGE_MOVE_LABELS;
  protected readonly stageIcons = STAGE_ICONS;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly applications = signal<JobApplication[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly columns = computed(() => boardColumns(this.applications() ?? []));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.careerService
      .applications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (applications) => {
          this.applications.set(applications);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async create(): Promise<void> {
    const saved = await openApplicationEditor(this.modal);
    if (saved) {
      this.toast.success('Application saved.');
      this.load();
    }
  }

  protected async move(application: JobApplication, stage: ApplicationStage): Promise<void> {
    const moved = await openStageMove(this.modal, application, stage);
    if (moved) {
      this.toast.success(
        moved.interviews.length > application.interviewCount &&
          moved.interviews.some((i) => i.eventId !== null)
          ? `Moved to ${STAGE_LABELS[stage]} — the round is on your calendar.`
          : `Moved to ${STAGE_LABELS[stage]}.`,
      );
      this.load();
    }
  }
}
