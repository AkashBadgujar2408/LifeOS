import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { HomeService, HouseholdProject } from '../../core/services/home.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMoney } from '../finance/finance-view';
import { openHouseholdProjectEditor } from './household-project-editor';

/** Work on the house: each project's tasks and what's been spent against its budget (linked expenses). */
@Component({
  selector: 'app-home-household-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Household projects</h1>
          <p class="text-body-secondary mb-0 small">
            Repairs and makeovers — tasks in Projects, spending against a budget.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="edit()">
          <i class="bi bi-plus-lg"></i> Start a project
        </button>
      </div>

      @if (loadFailed() && !projects()) {
        <app-load-error message="Couldn't load your household projects." (retry)="load()" />
      } @else if (projects(); as projects) {
        @if (projects.length === 0) {
          <p class="text-body-secondary">
            No household projects yet. Start one for the next repaint or repair — its tasks go in
            Projects and the expenses you link to it count against its budget.
          </p>
        } @else {
          <div class="row g-3">
            @for (p of projects; track p.id) {
              <div class="col-lg-6">
                <section class="card h-100" [class.text-body-secondary]="p.status !== 'Active'">
                  <div class="card-body">
                    <div class="d-flex gap-2 align-items-start mb-2">
                      <h2 class="h5 mb-0 me-auto min-w-0">
                        <button
                          type="button"
                          class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break fs-5"
                          (click)="edit(p)"
                        >
                          {{ p.name }}
                        </button>
                      </h2>
                      @if (p.status !== 'Active') {
                        <span class="badge text-bg-light border">{{ p.status }}</span>
                      }
                    </div>
                    <div class="small text-body-secondary mb-3">
                      @if (p.propertyName) {
                        {{ p.propertyName }} ·
                      }
                      <a [routerLink]="['/projects', p.projectId]">
                        {{ p.doneTasks }} of {{ p.openTasks + p.doneTasks }} tasks done
                      </a>
                    </div>
                    @if (p.budget !== null && p.currency) {
                      @let used = spentIn(p, p.currency);
                      <div class="d-flex justify-content-between small mb-1">
                        <span>
                          {{ money(used, p.currency) }} of {{ money(p.budget, p.currency) }}
                        </span>
                        <span
                          [class.text-danger-emphasis]="(p.budgetPercent ?? 0) > 100"
                          class="fw-semibold"
                        >
                          @if ((p.budgetPercent ?? 0) > 100) {
                            {{ money(used - p.budget, p.currency) }} over
                          } @else {
                            {{ p.budgetPercent }}%
                          }
                        </span>
                      </div>
                      <div
                        class="progress"
                        role="progressbar"
                        [attr.aria-label]="'Budget used for ' + p.name"
                        [attr.aria-valuenow]="p.budgetPercent"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        style="height: 0.5rem"
                      >
                        <div
                          class="progress-bar"
                          [style.width.%]="barWidth(p)"
                          [style.background]="
                            (p.budgetPercent ?? 0) > 100
                              ? 'var(--lifeos-red)'
                              : 'var(--lifeos-teal)'
                          "
                        ></div>
                      </div>
                    }
                    @if (otherSpending(p); as other) {
                      <p class="small text-body-secondary mt-2 mb-0">{{ other }}</p>
                    }
                    @if (p.spent.length === 0) {
                      <p class="small text-body-secondary mt-2 mb-0">No expenses linked yet.</p>
                    }
                  </div>
                </section>
              </div>
            }
          </div>
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HomeHouseholdProjects {
  private readonly homeService = inject(HomeService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly money = formatMoney;
  protected readonly projects = signal<HouseholdProject[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.homeService
      .householdProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          this.projects.set(projects);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected spentIn(project: HouseholdProject, currency: string): number {
    return project.spent.find((s) => s.currency === currency)?.amount ?? 0;
  }

  protected barWidth(project: HouseholdProject): number {
    return Math.min(100, Math.max(0, project.budgetPercent ?? 0));
  }

  /** Spending in currencies other than the budget's (or all of it, without a budget). */
  protected otherSpending(project: HouseholdProject): string | null {
    const other = project.spent.filter((s) => s.currency !== project.currency);
    if (other.length === 0) {
      return null;
    }
    const amounts = other.map((s) => formatMoney(s.amount, s.currency)).join(' + ');
    return project.currency ? `Also ${amounts} in other currencies.` : `Spent ${amounts}.`;
  }

  protected async edit(project?: HouseholdProject): Promise<void> {
    const result = await openHouseholdProjectEditor(this.modal, project);
    if (result) {
      this.load();
      this.toast.success(
        result.kind === 'saved'
          ? 'Project saved.'
          : 'No longer tracked here — it stays in Projects.',
      );
    }
  }
}
