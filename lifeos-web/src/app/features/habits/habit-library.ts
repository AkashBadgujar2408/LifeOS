import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { catchError, of } from 'rxjs';
import { HabitTemplate, HabitsService } from '../../core/services/habits.service';
import { scheduleLabel, targetLabel } from './habit-schedule';

/** Opens the habit library; resolves with the chosen template, or null if it was closed. */
export async function openHabitLibrary(modal: NgbModal): Promise<HabitTemplate | null> {
  const modalRef = modal.open(HabitLibrary, {
    ariaLabelledBy: 'habit-library-heading',
    size: 'lg',
  });
  try {
    return (await modalRef.result) as HabitTemplate;
  } catch {
    return null;
  }
}

/** Ready-made habits by category; picking one opens the editor with it filled in. */
@Component({
  selector: 'app-habit-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header">
      <h2 id="habit-library-heading" class="modal-title h5">Habit library</h2>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        (click)="activeModal.dismiss()"
      ></button>
    </div>
    <div class="modal-body">
      @if (templates() === null) {
        <p class="text-body-secondary mb-0">Loading...</p>
      } @else if (templates()!.length === 0) {
        <p class="text-body-secondary mb-0">The library couldn't be loaded. Try again later.</p>
      } @else {
        <ul class="nav nav-pills gap-1 mb-3">
          @for (category of categories(); track category) {
            <li class="nav-item">
              <button
                type="button"
                class="nav-link py-1 px-3"
                [class.active]="category === (selected() ?? categories()[0])"
                (click)="selected.set(category)"
              >
                {{ category }}
              </button>
            </li>
          }
        </ul>
        <div class="list-group">
          @for (template of shown(); track template.key) {
            <button
              type="button"
              class="list-group-item list-group-item-action d-flex gap-3 align-items-center"
              (click)="activeModal.close(template)"
            >
              <i
                class="bi {{
                  template.kind === 'Avoid' ? 'bi-slash-circle' : 'bi-arrow-repeat'
                }} fs-5 text-body-secondary"
                aria-hidden="true"
              ></i>
              <span class="flex-grow-1 min-w-0">
                <span class="d-block fw-semibold">{{ template.title }}</span>
                <span class="d-block small text-body-secondary">{{ template.description }}</span>
              </span>
              <span class="small text-body-secondary text-end text-nowrap">
                @if (template.kind === 'Avoid') {
                  Every clean day
                } @else {
                  {{ targetLabel(template) ?? scheduleLabel(template.scheduleDays) }}
                }
              </span>
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class HabitLibrary {
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly scheduleLabel = scheduleLabel;
  protected readonly targetLabel = targetLabel;
  protected readonly templates = toSignal<HabitTemplate[] | null>(
    inject(HabitsService)
      .templates()
      .pipe(catchError(() => of([]))),
    { initialValue: null },
  );
  protected readonly categories = computed(() => [
    ...new Set((this.templates() ?? []).map((t) => t.category)),
  ]);
  protected readonly selected = signal<string | null>(null);
  protected readonly shown = computed(() => {
    const category = this.selected() ?? this.categories()[0];
    return (this.templates() ?? []).filter((t) => t.category === category);
  });
}
