import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FamilyLogService, Interaction } from '../../core/services/family-log.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { interactionKind, peopleText } from './family-log-view';
import { openInteractionEditor } from './interaction-editor';

/**
 * A person's times in touch, newest first, for their page — log one (with them already chosen), open one to change
 * it. Emits `changed` after any change, since it moves their "last in touch" (and keep-in-touch due day).
 */
@Component({
  selector: 'app-person-interactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, LoadError],
  template: `
    <section class="card" aria-labelledby="person-interactions-heading">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 id="person-interactions-heading" class="h6 mb-0">Times in touch</h2>
          <button type="button" class="btn btn-sm btn-outline-primary" (click)="log()">
            <i class="bi bi-plus-lg"></i> Log time in touch
          </button>
        </div>
        @if (loadFailed()) {
          <app-load-error message="Couldn't load the times in touch." (retry)="load()" />
        } @else if (interactions(); as list) {
          @if (list.length === 0) {
            <p class="small text-body-secondary mb-0">
              Nothing logged yet. A call, a visit, a message to {{ contactName() }} — log it and
              "last in touch" keeps itself up to date.
            </p>
          } @else {
            <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
              @for (i of list; track i.id) {
                @let kind = kindOf(i.kind);
                <li class="d-flex align-items-start gap-2">
                  <i class="bi {{ kind.icon }} text-body-secondary mt-1" aria-hidden="true"></i>
                  <div class="min-w-0 flex-grow-1">
                    <button
                      type="button"
                      class="btn btn-link p-0 text-start text-break link-body-emphasis text-decoration-none"
                      (click)="open(i)"
                    >
                      {{ i.summary || kind.label }}
                    </button>
                    <div class="small text-body-secondary">
                      {{ i.occurredOn | date }} · {{ kind.label }}
                      @if (others(i); as others) {
                        · with {{ others }}
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          }
        } @else {
          <p class="small text-body-secondary mb-0">Loading...</p>
        }
      </div>
    </section>
  `,
})
export class PersonInteractions {
  private readonly familyLog = inject(FamilyLogService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly contactId = input.required<number>();
  readonly contactName = input('them');
  /** Something was logged, changed or deleted: their last-in-touch day may have moved. */
  readonly changed = output<void>();

  protected readonly kindOf = interactionKind;
  protected readonly interactions = signal<Interaction[] | null>(null);
  protected readonly loadFailed = signal(false);

  constructor() {
    effect(() => {
      this.contactId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.familyLog
      .interactions(this.contactId(), 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.interactions.set(list);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  /** Everyone else it was with. */
  protected others(i: Interaction): string {
    return peopleText(i.people.filter((p) => p.contactId !== this.contactId()).map((p) => p.name));
  }

  protected async log(): Promise<void> {
    this.after(await openInteractionEditor(this.modal, undefined, [this.contactId()]));
  }

  protected async open(interaction: Interaction): Promise<void> {
    this.after(await openInteractionEditor(this.modal, interaction));
  }

  private after(result: Awaited<ReturnType<typeof openInteractionEditor>>): void {
    if (result) {
      this.toast.success(result.kind === 'saved' ? 'Saved.' : 'Deleted.');
      this.load();
      this.changed.emit();
    }
  }
}
