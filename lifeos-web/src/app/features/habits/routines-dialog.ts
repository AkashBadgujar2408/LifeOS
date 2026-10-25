import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import { Habit } from '../../core/services/habits.service';
import { Routine, RoutinesService } from '../../core/services/routines.service';
import { ToastService } from '../../core/services/toast.service';

/** Opens the routines manager over the given habits; resolves when it closes. */
export async function openRoutinesDialog(modal: NgbModal, habits: readonly Habit[]): Promise<void> {
  const modalRef = modal.open(RoutinesDialog, { ariaLabelledBy: 'routines-heading' });
  (modalRef.componentInstance as RoutinesDialog).habits.set(habits);
  try {
    await modalRef.result;
  } catch {
    // Closed.
  }
}

/** Routines: ordered groups of build habits (Morning, Evening, Weekend) ticked together on My Day. */
@Component({
  selector: 'app-routines-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    <div class="modal-header">
      <h2 id="routines-heading" class="modal-title h5">Routines</h2>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        (click)="activeModal.dismiss()"
      ></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3">
      @if (editing() === null) {
        <p class="small text-body-secondary mb-0">
          Group habits you do together — a morning or evening routine — and tick them off in one go
          on My Day.
        </p>
        @if (routines() === null) {
          <p class="small text-body-secondary mb-0">Loading...</p>
        } @else {
          <ul class="list-group">
            @for (routine of routines(); track routine.id) {
              <li class="list-group-item d-flex gap-2 align-items-start">
                <div class="flex-grow-1 min-w-0">
                  <div class="fw-semibold">{{ routine.name }}</div>
                  <div class="small text-body-secondary text-break">{{ titlesOf(routine) }}</div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  (click)="edit(routine)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  [attr.aria-label]="'Delete ' + routine.name"
                  (click)="remove(routine)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </li>
            } @empty {
              <li class="list-group-item small text-body-secondary">No routines yet.</li>
            }
          </ul>
          <button type="button" class="btn btn-primary align-self-start" (click)="edit(null)">
            <i class="bi bi-plus-lg"></i> New routine
          </button>
        }
      } @else {
        <div>
          <label class="form-label" for="routine-name">Name</label>
          <input
            id="routine-name"
            type="text"
            class="form-control"
            [class.is-invalid]="nameError()"
            maxlength="100"
            placeholder="e.g. Morning"
            [ngModel]="name()"
            (ngModelChange)="name.set($event); touched.set(true)"
          />
          @if (nameError(); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div>
          <span class="form-label d-block">Habits, in the order you do them</span>
          <ol class="list-group list-group-numbered mb-2">
            @for (id of chosen(); track id; let i = $index) {
              <li class="list-group-item d-flex align-items-center gap-2">
                <span class="flex-grow-1 min-w-0 text-truncate">{{ titleOf(id) }}</span>
                <button
                  type="button"
                  class="btn btn-sm btn-link p-0"
                  [disabled]="i === 0"
                  [attr.aria-label]="'Move ' + titleOf(id) + ' up'"
                  (click)="move(i, -1)"
                >
                  <i class="bi bi-arrow-up"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-link p-0"
                  [disabled]="i === chosen().length - 1"
                  [attr.aria-label]="'Move ' + titleOf(id) + ' down'"
                  (click)="move(i, 1)"
                >
                  <i class="bi bi-arrow-down"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-link p-0 text-body-secondary"
                  [attr.aria-label]="'Take ' + titleOf(id) + ' out'"
                  (click)="drop(id)"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </li>
            }
          </ol>
          @if (available().length > 0) {
            <ng-select
              #habitPicker
              ariaLabel="Add a habit"
              [ngModel]="null"
              (ngModelChange)="add($event); $event !== null && habitPicker.clearModel()"
              placeholder="Type to add a habit"
            >
              @for (habit of available(); track habit.id) {
                <ng-option [value]="habit.id">{{ habit.title }}</ng-option>
              }
            </ng-select>
          }
          @if (habitsError(); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
          <div class="form-text">
            Only habits you're building can go in a routine. Habits not due on a day are left alone
            when you tick the routine.
          </div>
        </div>
      }
    </div>
    @if (editing() !== null) {
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="editing.set(null)">
          Back
        </button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
          Save routine
        </button>
      </div>
    }
  `,
})
export class RoutinesDialog {
  private readonly routinesService = inject(RoutinesService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  readonly habits = signal<readonly Habit[]>([]);
  protected readonly routines = signal<Routine[] | null>(null);
  /** null: the list; 0: a new routine; an id: that routine. */
  protected readonly editing = signal<number | null>(null);
  protected readonly name = signal('');
  protected readonly chosen = signal<number[]>([]);
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);

  private readonly buildHabits = computed(() =>
    this.habits().filter((h) => h.kind === 'Build' && h.status === 'Active'),
  );
  protected readonly available = computed(() =>
    this.buildHabits().filter((h) => !this.chosen().includes(h.id)),
  );
  protected readonly nameError = computed(() =>
    this.touched() && !this.name().trim() ? 'Give the routine a name.' : null,
  );
  protected readonly habitsError = computed(() =>
    this.touched() && this.chosen().length === 0 ? 'Add at least one habit.' : null,
  );

  constructor() {
    this.load();
  }

  protected titleOf(id: number): string {
    return this.habits().find((h) => h.id === id)?.title ?? 'A habit';
  }

  protected titlesOf(routine: Routine): string {
    return routine.habitIds.map((id) => this.titleOf(id)).join(' → ');
  }

  protected edit(routine: Routine | null): void {
    this.editing.set(routine?.id ?? 0);
    this.name.set(routine?.name ?? '');
    this.chosen.set(routine ? [...routine.habitIds] : []);
    this.touched.set(false);
  }

  protected add(id: number | null): void {
    if (id !== null) {
      this.chosen.update((ids) => [...ids, id]);
    }
  }

  protected drop(id: number): void {
    this.chosen.update((ids) => ids.filter((x) => x !== id));
  }

  protected move(index: number, step: -1 | 1): void {
    this.chosen.update((ids) => {
      const next = [...ids];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }

  protected save(): void {
    this.touched.set(true);
    if (this.nameError() || this.habitsError()) {
      return;
    }
    const id = this.editing();
    const save$ =
      id === 0 || id === null
        ? this.routinesService.create(this.name().trim(), this.chosen())
        : this.routinesService.update(id, this.name().trim(), this.chosen());
    this.saving.set(true);
    save$.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Routine saved.');
        this.editing.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the routine.'));
      },
    });
  }

  protected async remove(routine: Routine): Promise<void> {
    const answer = await Swal.fire({
      title: `Delete "${routine.name}"?`,
      text: 'Its habits stay — only the grouping goes.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete routine',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }
    this.routinesService.remove(routine.id).subscribe({
      next: () => this.load(),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the routine.')),
    });
  }

  private load(): void {
    this.routinesService.list().subscribe({
      next: (routines) => this.routines.set(routines),
      error: (err) => {
        this.routines.set([]);
        this.toast.error(apiErrorMessage(err, 'Could not load your routines.'));
      },
    });
  }
}
