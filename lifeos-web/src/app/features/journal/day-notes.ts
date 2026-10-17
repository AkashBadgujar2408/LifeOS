import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage } from '../../core/services/api-error';
import { DayNotes as DayNotesData, JournalService } from '../../core/services/journal.service';
import { ToastService } from '../../core/services/toast.service';

type ListName = 'gratitude' | 'lessons';

const LISTS: readonly { name: ListName; label: string; icon: string; placeholder: string }[] = [
  {
    name: 'gratitude',
    label: 'Grateful for',
    icon: 'bi-heart',
    placeholder: 'e.g. A long call with an old friend',
  },
  {
    name: 'lessons',
    label: 'Life lessons',
    icon: 'bi-lightbulb',
    placeholder: 'e.g. Ask for help sooner',
  },
];

/** A day's gratitude list and life lessons: add lines, remove them, save both together. */
@Component({
  selector: 'app-day-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="row g-3">
      @for (list of lists; track list.name) {
        <div class="col-md-6">
          <div class="small fw-semibold text-body-secondary mb-2">
            <i class="bi {{ list.icon }}"></i> {{ list.label }}
          </div>
          <ul class="list-unstyled mb-2 d-flex flex-column gap-1">
            @for (item of items()[list.name]; track $index) {
              <li class="small d-flex gap-2 align-items-start">
                <span class="flex-grow-1 text-break">{{ item }}</span>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 text-body-secondary"
                  [attr.aria-label]="'Remove ' + item"
                  (click)="removeItem(list.name, $index)"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </li>
            } @empty {
              <li class="small text-body-secondary">Nothing yet.</li>
            }
          </ul>
          <div class="input-group input-group-sm">
            <input
              type="text"
              class="form-control"
              [class.is-invalid]="tooLong()[list.name]"
              [attr.aria-label]="'Add to ' + list.label"
              [placeholder]="list.placeholder"
              maxlength="501"
              [ngModel]="drafts()[list.name]"
              (ngModelChange)="setDraft(list.name, $event)"
              (keydown.enter)="$event.preventDefault(); addItem(list.name)"
            />
            <button type="button" class="btn btn-outline-secondary" (click)="addItem(list.name)">
              Add
            </button>
          </div>
          @if (tooLong()[list.name]) {
            <div class="invalid-feedback d-block">Keep each one under 500 characters.</div>
          }
        </div>
      }
    </div>
    @if (dirty()) {
      <div class="d-flex justify-content-end align-items-center gap-2 mt-3">
        <span class="small text-warning-emphasis">Unsaved changes</span>
        <button type="button" class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()">
          Save lists
        </button>
      </div>
    }
  `,
})
export class DayNotes {
  private readonly journalService = inject(JournalService);
  private readonly toast = inject(ToastService);

  readonly day = input.required<string>();

  protected readonly lists = LISTS;
  protected readonly items = signal<Record<ListName, string[]>>({ gratitude: [], lessons: [] });
  protected readonly drafts = signal<Record<ListName, string>>({ gratitude: '', lessons: '' });
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly tooLong = computed(() => ({
    gratitude: this.drafts().gratitude.trim().length > 500,
    lessons: this.drafts().lessons.trim().length > 500,
  }));

  constructor() {
    effect(() => {
      const day = this.day();
      untracked(() => this.load(day));
    });
  }

  /** Whether there's something not saved yet (typed into a box, or added/removed). */
  hasUnsavedChanges(): boolean {
    const drafts = this.drafts();
    return this.dirty() || drafts.gratitude.trim() !== '' || drafts.lessons.trim() !== '';
  }

  protected setDraft(name: ListName, text: string): void {
    this.drafts.update((d) => ({ ...d, [name]: text }));
  }

  protected addItem(name: ListName): void {
    const text = this.drafts()[name].trim();
    if (!text || text.length > 500) {
      return;
    }
    this.items.update((items) => ({ ...items, [name]: [...items[name], text] }));
    this.setDraft(name, '');
    this.dirty.set(true);
  }

  protected removeItem(name: ListName, index: number): void {
    this.items.update((items) => ({ ...items, [name]: items[name].filter((_, i) => i !== index) }));
    this.dirty.set(true);
  }

  protected save(): void {
    this.saving.set(true);
    this.journalService.saveNotes(this.day(), this.items()).subscribe({
      next: (notes) => {
        this.saving.set(false);
        this.set(notes);
        this.toast.success('Lists saved.');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the lists.'));
      },
    });
  }

  private load(day: string): void {
    this.set({ entryDate: day, gratitude: [], lessons: [] });
    this.journalService.getNotes(day).subscribe({
      next: (notes) => this.set(notes),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load the lists.')),
    });
  }

  private set(notes: DayNotesData): void {
    this.items.set({ gratitude: notes.gratitude, lessons: notes.lessons });
    this.drafts.set({ gratitude: '', lessons: '' });
    this.dirty.set(false);
  }
}
