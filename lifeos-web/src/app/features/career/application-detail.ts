import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { APP_DATE_TIME_FORMAT, APP_TIME_FORMAT } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { itemTitle } from '../../core/layout/item-title';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  APPLICATION_STAGES,
  ApplicationStage,
  CareerService,
  Interview,
  InterviewQuestion,
  JOB_APPLICATION_ENTITY_TYPE,
  JobApplicationDetail,
  MockInterview,
} from '../../core/services/career.service';
import { ContactsService } from '../../core/services/contacts.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openContactEditor } from '../contacts/contact-editor';
import { openApplicationEditor } from './application-editor';
import { STAGE_ICONS, STAGE_LABELS, STAGE_MOVE_LABELS, practisedText } from './career-view';
import { openInterviewEditor } from './interview-editor';
import { openMockInterviewEditor } from './mock-interview-editor';
import { openQuestionEditor } from './question-editor';
import { openStageMove } from './stage-move-dialog';

/**
 * One application: where it stands and how it got there (the stage history), its interview rounds (each on the
 * calendar once it has a time), the questions asked in it, and its links and reminders.
 */
@Component({
  selector: 'app-application-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    LinkedItems,
    EntityReminders,
    LoadError,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
  ],
  templateUrl: './application-detail.html',
})
export class ApplicationDetail {
  private readonly careerService = inject(CareerService);
  private readonly contactsService = inject(ContactsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly entityType = JOB_APPLICATION_ENTITY_TYPE;
  protected readonly stages = APPLICATION_STAGES;
  protected readonly stageLabels = STAGE_LABELS;
  protected readonly moveLabels = STAGE_MOVE_LABELS;
  protected readonly stageIcons = STAGE_ICONS;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly timeFormat = APP_TIME_FORMAT;
  protected readonly practisedText = practisedText;
  protected readonly today = todayIso();

  protected readonly application = signal<JobApplicationDetail | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly questions = signal<InterviewQuestion[]>([]);
  protected readonly mocks = signal<MockInterview[]>([]);
  private readonly titled = itemTitle(() => {
    const a = this.application();
    return a ? `${a.role} at ${a.organisation}` : undefined;
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.careerService
      .application(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
    this.loadQuestions();
    this.loadMocks();
  }

  private loadMocks(): void {
    this.careerService
      .mockInterviews({ applicationId: Number(this.id()) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      // A side list, like the questions: if it can't load, the card just shows none.
      .subscribe({ next: (m) => this.mocks.set(m), error: () => this.mocks.set([]) });
  }

  private loadQuestions(): void {
    this.careerService
      .questions({ applicationId: Number(this.id()) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      // A side list: if it can't load, the card just shows none.
      .subscribe({ next: (q) => this.questions.set(q), error: () => this.questions.set([]) });
  }

  /** The history's sentence for a move: "Applied", "Interviewing (from Rejected)". */
  protected stepText(from: ApplicationStage | null, to: ApplicationStage): string {
    if (from === null) {
      return to === 'Saved' ? 'Saved' : `Added as ${STAGE_LABELS[to]}`;
    }
    return `${STAGE_MOVE_LABELS[to]}`;
  }

  /** "Ends 11:00 am" on the same day as its start, else the full date and time. */
  protected sameDay(interview: Interview): boolean {
    return (
      !!interview.startsAt &&
      !!interview.endsAt &&
      new Date(interview.startsAt).toDateString() === new Date(interview.endsAt).toDateString()
    );
  }

  protected async edit(application: JobApplicationDetail): Promise<void> {
    const saved = await openApplicationEditor(this.modal, application);
    if (saved) {
      this.application.set(saved);
      this.toast.success('Application saved.');
    }
  }

  protected async move(application: JobApplicationDetail, stage: ApplicationStage): Promise<void> {
    const moved = await openStageMove(this.modal, application, stage);
    if (moved) {
      this.application.set(moved);
      this.toast.success(`Moved to ${STAGE_LABELS[stage]}.`);
    }
  }

  protected async openRound(
    application: JobApplicationDetail,
    interview?: Interview,
  ): Promise<void> {
    const result = await openInterviewEditor(this.modal, application.id, interview);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Round saved.' : 'Round deleted.');
      this.load();
    }
  }

  protected async openQuestion(question?: InterviewQuestion): Promise<void> {
    const result = await openQuestionEditor(this.modal, question, Number(this.id()));
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Question saved.' : 'Question deleted.');
      this.loadQuestions();
    }
  }

  protected async openMock(mock?: MockInterview): Promise<void> {
    const result = await openMockInterviewEditor(this.modal, mock, Number(this.id()));
    if (result) {
      this.toast.success(
        result.kind === 'saved' ? 'Mock interview saved.' : 'Mock interview deleted.',
      );
      this.load();
    }
  }

  protected openContact(id: number): void {
    this.contactsService.get(id).subscribe({
      next: async (contact) => {
        const result = await openContactEditor(this.modal, contact);
        if (result) {
          this.toast.success(result.kind === 'saved' ? 'Contact saved.' : 'Contact deleted.');
          this.load();
        }
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the contact.')),
    });
  }

  protected async remove(application: JobApplicationDetail): Promise<void> {
    const confirmed = await Swal.fire({
      title: `Delete "${application.role} at ${application.organisation}"?`,
      text: 'Its history and rounds go with it (and the rounds leave your calendar). Questions asked in it stay in your question bank, and its mock interviews stay as general practice.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.careerService.removeApplication(application.id).subscribe({
      next: () => {
        this.toast.success('Application deleted.');
        void this.router.navigate(['/career/applications']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the application.')),
    });
  }
}
