import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  NgbActiveModal,
  NgbDateStruct,
  NgbInputDatepicker,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { Chapter, ChapterSaveResult, StoryService } from '../../core/services/story.service';
import { ToastService } from '../../core/services/toast.service';

export type ChapterEditorResult =
  { kind: 'saved'; result: ChapterSaveResult } | { kind: 'deleted'; id: number };

/** Opens the create/edit dialog; resolves with what happened, or null if it was dismissed. */
export async function openChapterEditor(
  modal: NgbModal,
  chapter?: Chapter,
): Promise<ChapterEditorResult | null> {
  const modalRef = modal.open(ChapterEditor, { ariaLabelledBy: 'chapter-editor-heading' });
  (modalRef.componentInstance as ChapterEditor).configure(chapter);
  try {
    return (await modalRef.result) as ChapterEditorResult;
  } catch {
    return null;
  }
}

/** Chapters can reach far back (school, childhood): the datepicker's default is only ten years either side. */
const EARLIEST: NgbDateStruct = { year: 1900, month: 1, day: 1 };

@Component({
  selector: 'app-chapter-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  templateUrl: './chapter-editor.html',
})
export class ChapterEditor {
  private readonly fb = inject(FormBuilder);
  private readonly storyService = inject(StoryService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly chapter = signal<Chapter | null>(null);
  protected readonly saving = signal(false);
  protected readonly earliest = EARLIEST;

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    startDate: this.fb.control<string | null>(null, Validators.required),
    isCurrent: this.fb.nonNullable.control(true),
    endDate: this.fb.control<string | null>(null),
    summary: this.fb.nonNullable.control('', Validators.maxLength(4000)),
  });

  constructor() {
    // "Still going" means no end date: clear and disable it, so it can't be submitted by accident.
    this.form.controls.isCurrent.valueChanges.subscribe((current) => {
      const end = this.form.controls.endDate;
      if (current) {
        end.setValue(null);
        end.disable();
      } else {
        end.enable();
      }
    });
    this.form.controls.endDate.disable();
  }

  configure(chapter?: Chapter): void {
    this.chapter.set(chapter ?? null);
    this.form.reset({
      title: chapter?.title ?? '',
      startDate: chapter?.startDate ?? todayIso(),
      isCurrent: chapter ? chapter.isCurrent : true,
      endDate: chapter?.endDate ?? null,
      summary: chapter?.summary ?? '',
    });
  }

  protected fieldError(name: 'title' | 'startDate' | 'endDate' | 'summary'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'title':
        return control.errors['required']
          ? 'Give the chapter a title.'
          : 'Keep the title under 200 characters.';
      case 'startDate':
        return control.errors['required']
          ? 'When did this chapter begin?'
          : dateFieldError(control.errors);
      case 'endDate':
        return control.errors['required']
          ? 'When did it end? Or tick "still going".'
          : dateFieldError(control.errors);
      case 'summary':
        return 'Keep the summary under 4000 characters.';
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    const end = this.form.controls.endDate;
    // A finished chapter needs its end date.
    end.setValidators(this.form.controls.isCurrent.value ? null : Validators.required);
    end.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      title: value.title,
      summary: value.summary.trim() || null,
      startDate: value.startDate!,
      endDate: value.isCurrent ? null : value.endDate,
    };
    const chapter = this.chapter();
    const request = chapter
      ? this.storyService.updateChapter(chapter.id, payload)
      : this.storyService.createChapter(payload);

    this.saving.set(true);
    request.subscribe({
      next: (result) => this.activeModal.close({ kind: 'saved', result } as ChapterEditorResult),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the chapter.'));
      },
    });
  }

  protected async remove(): Promise<void> {
    const chapter = this.chapter();
    if (!chapter) {
      return;
    }
    const confirm = await Swal.fire({
      title: `Delete "${chapter.title}"?`,
      text: 'Only the chapter goes — everything that happened in it stays in your story, just without this heading.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete chapter',
      confirmButtonColor: '#dc3545',
    });
    if (!confirm.isConfirmed) {
      return;
    }
    this.storyService.deleteChapter(chapter.id).subscribe({
      next: () =>
        this.activeModal.close({ kind: 'deleted', id: chapter.id } as ChapterEditorResult),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the chapter.')),
    });
  }
}
