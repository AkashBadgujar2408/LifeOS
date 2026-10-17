import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { todayIso } from '../../core/dates/today';
import { Decision, DecisionsService } from '../../core/services/decisions.service';
import { ToastService } from '../../core/services/toast.service';
import { openDecisionEditor } from './decision-editor';
import { reviewState, verdictMeta } from './decision-view';

/** The decisions made on one journal day, with "Record a decision" for that day. */
@Component({
  selector: 'app-day-decisions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <span class="small fw-semibold text-body-secondary">
        <i class="bi bi-signpost-split"></i> Decisions
      </span>
      <span class="d-flex gap-2">
        <a routerLink="/journal/decisions" class="btn btn-link btn-sm p-0">All</a>
        <button type="button" class="btn btn-link btn-sm p-0" (click)="add()">
          + Record a decision
        </button>
      </span>
    </div>
    @if (decisions().length === 0) {
      <div class="small text-body-secondary">
        None made this day. Writing one down — and why — lets you look back on it later.
      </div>
    } @else {
      <ul class="list-unstyled mb-0 d-flex flex-column gap-1">
        @for (d of decisions(); track d.id) {
          <li class="small d-flex gap-2 align-items-start">
            <button
              type="button"
              class="btn btn-link btn-sm p-0 text-start text-break flex-grow-1"
              (click)="open(d)"
            >
              {{ d.title }}
            </button>
            <span class="text-body-secondary text-nowrap">
              @switch (state(d)) {
                @case ('reviewed') {
                  {{ verdictMeta(d.verdict)?.label ?? 'Reviewed' }}
                }
                @case ('due') {
                  Due for review
                }
                @case ('waiting') {
                  Review later
                }
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class DayDecisions {
  private readonly decisionsService = inject(DecisionsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);

  readonly day = input.required<string>();

  protected readonly verdictMeta = verdictMeta;
  protected readonly decisions = signal<Decision[]>([]);
  private readonly today = todayIso();

  constructor() {
    effect(() => {
      const day = this.day();
      untracked(() => this.load(day));
    });
  }

  protected state(decision: Decision) {
    return reviewState(decision, this.today);
  }

  private load(day: string): void {
    this.decisionsService.list(day).subscribe({
      next: (decisions) => this.decisions.set(decisions),
      // Secondary to the day's entry: an empty list rather than a second error toast.
      error: () => this.decisions.set([]),
    });
  }

  protected async add(): Promise<void> {
    if (await openDecisionEditor(this.modal, { day: this.day() })) {
      this.toast.success('Decision recorded.');
      this.load(this.day());
    }
  }

  protected async open(decision: Decision): Promise<void> {
    const result = await openDecisionEditor(this.modal, { decision });
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Decision saved.' : 'Decision deleted.');
      this.load(this.day());
    }
  }
}
