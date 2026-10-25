import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { ColDef } from 'ag-grid-community';
import { todayIso } from '../../core/dates/today';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { GridView, ViewToggle } from '../../core/grid/view-toggle';
import { apiErrorMessage } from '../../core/services/api-error';
import { CareerService, InterviewQuestion } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { filterQuestions, practisedText } from './career-view';
import { openQuestionEditor } from './question-editor';

/**
 * The interview question bank: try the question first, then show your answer, and mark it practised. Narrowed by
 * words or a topic client-side (filterQuestions — the list is already here); least recently practised first, so
 * the ones you haven't touched come up. Or the whole bank as one table (Session 75a) to sort, page and export.
 */
@Component({
  selector: 'app-career-questions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    LoadError,
    DataGrid,
    ViewToggle,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Interview prep</h1>
          <p class="text-body-secondary mb-0 small">
            Questions you've been asked or expect, with your answers. Say it out loud first, then
            check yourself.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open()">
          <i class="bi bi-plus-lg"></i> Add a question
        </button>
      </div>

      @if (loadFailed() && !questions()) {
        <app-load-error message="Couldn't load your question bank." (retry)="load()" />
      } @else if (questions(); as questions) {
        @if (questions.length === 0) {
          <p class="text-body-secondary">
            No questions yet. Start with the three you dread most — and the ones from your last
            interview, while you remember them.
          </p>
        } @else {
          <div class="d-flex flex-wrap gap-2 mb-3">
            <input
              type="search"
              class="form-control flex-grow-1"
              style="max-width: 24rem"
              placeholder="Search questions and answers"
              aria-label="Search questions and answers"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            @if (tagOptions().length > 0) {
              <ng-select
                class="w-auto"
                ariaLabel="Topic"
                [ngModel]="tagId()"
                (ngModelChange)="tagId.set($event ?? null)"
                placeholder="Every topic"
              >
                @for (tag of tagOptions(); track tag.id) {
                  <ng-option [value]="tag.id">{{ tag.name }}</ng-option>
                }
              </ng-select>
            }
            <div class="ms-auto">
              <app-view-toggle
                key="interview-questions"
                label="Show questions"
                cardsLabel="Practice"
                cardsIcon="bi-chat-square-quote"
                [(view)]="view"
              />
            </div>
          </div>
          @if (view() === 'table') {
            @if (listed().length) {
              <app-data-grid
                name="interview-questions"
                [rows]="listed()"
                [columns]="columns"
                [phoneColumns]="['question', 'lastPractisedOn']"
                [rowId]="rowId"
                [noun]="['question', 'questions']"
                (open)="open($event)"
              />
            } @else {
              <p class="text-body-secondary">Nothing matches.</p>
            }
          } @else {
            <div class="card">
              <ul class="list-group list-group-flush">
                @for (q of listed(); track q.id) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap align-items-start gap-2">
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                          (click)="open(q)"
                        >
                          {{ q.question }}
                        </button>
                        <div class="small text-body-secondary">
                          {{ practisedText(q.lastPractisedOn, today()) }}
                          @if (q.applicationTitle) {
                            · asked at
                            <a [routerLink]="['/career/applications', q.jobApplicationId]">{{
                              q.applicationTitle
                            }}</a>
                          }
                          @for (tag of q.tags; track tag.id) {
                            <span class="badge rounded-pill text-bg-light border fw-normal ms-1">{{
                              tag.name
                            }}</span>
                          }
                        </div>
                      </div>
                      <div class="d-flex gap-2">
                        @if (q.answer) {
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            [attr.aria-expanded]="revealed().has(q.id)"
                            (click)="toggle(q)"
                          >
                            {{ revealed().has(q.id) ? 'Hide answer' : 'Show answer' }}
                          </button>
                        }
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary"
                          [disabled]="busyId() === q.id || q.lastPractisedOn === today()"
                          (click)="practised(q)"
                        >
                          <i class="bi bi-check2"></i> Practised
                        </button>
                      </div>
                    </div>
                    @if (revealed().has(q.id)) {
                      <div class="small mt-2 text-break" style="white-space: pre-line">
                        {{ q.answer }}
                      </div>
                      @if (q.reviewNotes) {
                        <div
                          class="small mt-1 text-body-secondary text-break"
                          style="white-space: pre-line"
                        >
                          To do better: {{ q.reviewNotes }}
                        </div>
                      }
                    }
                  </li>
                } @empty {
                  <li class="list-group-item text-body-secondary">
                    Nothing matches.
                    <button
                      type="button"
                      class="btn btn-link btn-sm p-0 align-baseline"
                      (click)="clear()"
                    >
                      Clear the search
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class CareerQuestions {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  protected readonly practisedText = practisedText;
  protected readonly today = signal(todayIso());
  protected readonly questions = signal<InterviewQuestion[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly revealed = signal<ReadonlySet<number>>(new Set());
  protected readonly busyId = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly tagId = signal<number | null>(null);
  protected readonly view = signal<GridView>('cards');
  protected readonly rowId = (q: InterviewQuestion) => q.id;
  protected readonly columns: ColDef<InterviewQuestion>[] = [
    { headerName: 'Question', field: 'question', flex: 3, minWidth: 200 },
    { headerName: 'Answer', field: 'answer', flex: 2, minWidth: 160 },
    {
      headerName: 'Practised',
      field: 'lastPractisedOn',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
    },
    { headerName: 'Asked at', field: 'applicationTitle', flex: 1, minWidth: 140 },
    {
      headerName: 'Topics',
      colId: 'tags',
      flex: 1,
      minWidth: 120,
      valueGetter: (p) => p.data?.tags.map((t) => t.name).join(', ') ?? '',
    },
    { headerName: 'To do better', field: 'reviewNotes', flex: 1, minWidth: 150 },
  ];

  /** Least recently practised first (never practised before anything), then newest. */
  protected readonly listed = computed(() =>
    filterQuestions(this.questions() ?? [], { text: this.query(), tagId: this.tagId() }).sort(
      (a, b) => (a.lastPractisedOn ?? '').localeCompare(b.lastPractisedOn ?? '') || b.id - a.id,
    ),
  );
  protected readonly tagOptions = computed(() => {
    const tags = new Map<number, string>();
    (this.questions() ?? []).forEach((q) => q.tags.forEach((t) => tags.set(t.id, t.name)));
    return [...tags]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.today.set(todayIso());
    this.careerService
      .questions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (questions) => {
          this.questions.set(questions);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected clear(): void {
    this.query.set('');
    this.tagId.set(null);
  }

  protected toggle(question: InterviewQuestion): void {
    this.revealed.update((set) => {
      const next = new Set(set);
      if (!next.delete(question.id)) {
        next.add(question.id);
      }
      return next;
    });
  }

  protected practised(question: InterviewQuestion): void {
    this.busyId.set(question.id);
    this.careerService.practised(question.id, this.today()).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.questions.update((list) =>
          (list ?? []).map((q) => (q.id === updated.id ? updated : q)),
        );
        this.toast.success('Marked as practised today.');
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not mark it practised.'));
      },
    });
  }

  protected async open(question?: InterviewQuestion): Promise<void> {
    const result = await openQuestionEditor(this.modal, question);
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Question saved.' : 'Question deleted.');
      this.load();
    }
  }
}
