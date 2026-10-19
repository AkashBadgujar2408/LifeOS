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
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  CONDITION_KINDS,
  ConditionKind,
  HealthLockedError,
  HealthService,
  MedicalCondition,
} from '../../core/services/health.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { openConditionEditor } from './condition-editor';
import { CONDITION_KIND_ICONS, CONDITION_KIND_LABELS, CONDITION_KIND_PLURALS } from './health-view';

/** Medical history: conditions (ongoing first), allergies, surgeries — each opens in its editor. */
@Component({
  selector: 'app-health-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Medical history</h1>
          <p class="text-body-secondary mb-0 small">
            Diagnoses, allergies and surgeries — notes are encrypted.
          </p>
        </div>
      </div>

      @if (loadFailed(); as message) {
        <app-load-error [message]="message" (retry)="load()" />
      } @else if (conditions()) {
        <div class="row g-3">
          @for (kind of kinds; track kind) {
            <div class="col-lg-4">
              <div class="card h-100">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <h2 class="h5 mb-0">
                      <i class="bi {{ icons[kind] }}" aria-hidden="true"></i> {{ plurals[kind] }}
                    </h2>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      [attr.aria-label]="'Add ' + labels[kind].toLowerCase()"
                      (click)="edit(undefined, kind)"
                    >
                      <i class="bi bi-plus-lg"></i> Add
                    </button>
                  </div>
                  @if (byKind()[kind].length === 0) {
                    <p class="small text-body-secondary mb-0">None recorded.</p>
                  } @else {
                    <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
                      @for (c of byKind()[kind]; track c.id) {
                        <li [class.text-body-secondary]="c.endedOn !== null">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                            (click)="edit(c)"
                          >
                            {{ c.name }}
                          </button>
                          <div class="small text-body-secondary">
                            @if (c.severity) {
                              <span [class.text-danger-emphasis]="c.severity === 'Severe'">{{
                                c.severity
                              }}</span>
                            }
                            @if (kind === 'Surgery') {
                              {{ c.startedOn ? (c.startedOn | date) : 'Date not recorded' }}
                            } @else if (c.endedOn) {
                              {{ c.severity ? '· ' : '' }}Resolved {{ c.endedOn | date }}
                            } @else if (c.startedOn) {
                              {{ c.severity ? '· ' : '' }}Since {{ c.startedOn | date }}
                            } @else if (!c.severity) {
                              Ongoing
                            }
                          </div>
                        </li>
                      }
                    </ul>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class HealthHistory {
  private readonly healthService = inject(HealthService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kinds = CONDITION_KINDS;
  protected readonly labels = CONDITION_KIND_LABELS;
  protected readonly plurals = CONDITION_KIND_PLURALS;
  protected readonly icons = CONDITION_KIND_ICONS;
  protected readonly conditions = signal<MedicalCondition[] | null>(null);
  protected readonly loadFailed = signal<string | null>(null);

  /** The server's order (ongoing first, then most recent) within each kind. */
  protected readonly byKind = computed(() => {
    const groups: Record<ConditionKind, MedicalCondition[]> = {
      Condition: [],
      Allergy: [],
      Surgery: [],
    };
    for (const c of this.conditions() ?? []) {
      groups[c.kind].push(c);
    }
    return groups;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.healthService
      .conditions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conditions) => {
          this.conditions.set(conditions);
          this.loadFailed.set(null);
        },
        error: (err: unknown) =>
          this.loadFailed.set(
            err instanceof HealthLockedError ? err.message : "Couldn't load your medical history.",
          ),
      });
  }

  protected async edit(
    condition?: MedicalCondition,
    kind: ConditionKind = 'Condition',
  ): Promise<void> {
    const result = await openConditionEditor(this.modal, condition, kind);
    this.load();
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
    }
  }
}
