import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ColDef } from 'ag-grid-community';
import { DataGrid } from '../../core/grid/data-grid';
import { dayFormatter } from '../../core/grid/grid-format';
import { GridView, ViewToggle } from '../../core/grid/view-toggle';
import { apiErrorMessage } from '../../core/services/api-error';
import { CareerService, MockInterview } from '../../core/services/career.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { mockTitle } from './career-view';
import { openMockInterviewEditor } from './mock-interview-editor';

/**
 * Mock interviews (Session 54a): practice interviews done by voice with an AI outside LifeOS, recorded afterwards —
 * newest first, as cards or one table to sort and export. `?open=<id>` opens one (search and links land here).
 */
@Component({
  selector: 'app-career-mock-interviews',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError, DataGrid, ViewToggle],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Mock interviews</h1>
          <p class="text-body-secondary mb-0 small">
            Practice runs you did out loud with an AI — what it rated you and what to work on.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Record one
        </button>
      </div>

      @if (loadFailed() && !mocks()) {
        <app-load-error message="Couldn't load your mock interviews." (retry)="load()" />
      } @else if (mocks(); as mocks) {
        @if (mocks.length === 0) {
          <p class="text-body-secondary">
            Nothing recorded yet. After a practice run in the Gemini app (or any AI), note the
            rating it gave and what it said to improve, while you remember.
          </p>
        } @else {
          <div class="d-flex justify-content-end mb-3">
            <app-view-toggle
              key="mock-interviews"
              label="Show mock interviews"
              cardsLabel="List"
              cardsIcon="bi-mic"
              [(view)]="view"
            />
          </div>
          @if (view() === 'table') {
            <app-data-grid
              name="mock-interviews"
              [rows]="mocks"
              [columns]="columns"
              [phoneColumns]="['heldOn', 'rating']"
              [rowId]="rowId"
              [noun]="['mock interview', 'mock interviews']"
              (open)="edit($event)"
            />
          } @else {
            <div class="card">
              <ul class="list-group list-group-flush">
                @for (m of mocks; track m.id) {
                  <li class="list-group-item py-3">
                    <div class="d-flex flex-wrap align-items-start gap-2">
                      <div class="min-w-0 flex-grow-1">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                          (click)="edit(m)"
                        >
                          {{ mockTitle(m) }}
                        </button>
                        <div class="small text-body-secondary">
                          {{ m.heldOn | date }} · {{ m.tool }}
                          @if (m.durationMinutes) {
                            · {{ m.durationMinutes }} min
                          }
                          @if (m.applicationTitle) {
                            · for
                            <a [routerLink]="['/career/applications', m.jobApplicationId]">{{
                              m.applicationTitle
                            }}</a>
                          } @else {
                            · general practice
                          }
                        </div>
                      </div>
                      @if (m.rating) {
                        <span class="badge rounded-pill text-bg-light border fs-6 fw-normal">
                          {{ m.rating }}
                        </span>
                      }
                    </div>
                    @if (m.improvements) {
                      <div class="small mt-2 text-break" style="white-space: pre-line">
                        <span class="text-body-secondary">To improve:</span> {{ m.improvements }}
                      </div>
                    }
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
export class CareerMockInterviews {
  private readonly careerService = inject(CareerService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);

  /** `?open=<id>` (from search, a link or a reminder) opens that mock interview. */
  readonly open = input<string>();

  protected readonly mockTitle = mockTitle;
  protected readonly mocks = signal<MockInterview[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly view = signal<GridView>('cards');
  protected readonly rowId = (m: MockInterview) => m.id;
  protected readonly columns: ColDef<MockInterview>[] = [
    {
      headerName: 'Held on',
      field: 'heldOn',
      width: 130,
      valueFormatter: dayFormatter(this.locale),
      sort: 'desc',
    },
    {
      headerName: 'Role',
      colId: 'role',
      flex: 1.5,
      minWidth: 160,
      valueGetter: (p) => p.data && mockTitle(p.data),
    },
    { headerName: 'Rating', field: 'rating', width: 110 },
    { headerName: 'AI', field: 'tool', width: 110 },
    { headerName: 'Minutes', field: 'durationMinutes', width: 100 },
    { headerName: 'For', field: 'applicationTitle', flex: 1, minWidth: 140 },
    { headerName: 'Strengths', field: 'strengths', flex: 1, minWidth: 150 },
    { headerName: 'To improve', field: 'improvements', flex: 1, minWidth: 150 },
  ];

  constructor() {
    effect(() => {
      const id = Number(this.open());
      if (id) {
        untracked(() => {
          void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
          this.careerService.mockInterview(id).subscribe({
            next: (mock) => void this.edit(mock),
            error: (err) =>
              this.toast.error(apiErrorMessage(err, 'Could not open the mock interview.')),
          });
        });
      }
    });
    this.load();
  }

  protected load(): void {
    this.careerService
      .mockInterviews()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mocks) => {
          this.mocks.set(mocks);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected async edit(mock?: MockInterview): Promise<void> {
    const result = await openMockInterviewEditor(this.modal, mock);
    if (result) {
      this.toast.success(
        result.kind === 'saved' ? 'Mock interview saved.' : 'Mock interview deleted.',
      );
      this.load();
    }
  }
}
