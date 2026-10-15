import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../../core/services/toast.service';
import { INBOX_KINDS, InboxKind, InboxService } from '../../../core/services/inbox.service';
import { apiErrorMessage } from '../../../core/services/api-error';

const KIND_META: Record<InboxKind, { icon: string; placeholder: string }> = {
  Task: { icon: 'bi-check2-square', placeholder: 'e.g. Renew passport' },
  Note: { icon: 'bi-sticky', placeholder: 'e.g. Wi-Fi password for the new router' },
  Journal: { icon: 'bi-journal-text', placeholder: 'e.g. Great run this morning, felt strong' },
  Idea: { icon: 'bi-lightbulb', placeholder: 'e.g. Build a recipe tracker in LifeOS' },
};

/** Opened from anywhere via QuickAdd (shell FAB / "q" shortcut); everything lands in the capture inbox. */
@Component({
  selector: 'app-quick-add-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './quick-add-dialog.html',
})
export class QuickAddDialog {
  private readonly fb = inject(FormBuilder);
  private readonly inboxService = inject(InboxService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = INBOX_KINDS;
  protected readonly kindMeta = KIND_META;
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    kind: ['Task' as InboxKind, Validators.required],
    title: ['', [Validators.required, Validators.maxLength(300)]],
    notes: ['', Validators.maxLength(4000)],
  });

  /** Called by QuickAddService when opened from a context that implies the kind (e.g. the Tasks page). */
  presetKind(kind: InboxKind): void {
    this.form.controls.kind.setValue(kind);
  }

  protected fieldError(name: 'title' | 'notes'): string | null {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return 'Give it a short title.';
    }

    if (control.errors['maxlength']) {
      const max = control.errors['maxlength'].requiredLength as number;
      return `Keep this under ${max} characters.`;
    }

    return null;
  }

  submit(): void {
    const { kind, title, notes } = this.form.getRawValue();
    if (!title.trim()) {
      this.form.controls.title.setValue('');
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.inboxService.create({ kind, title: title.trim(), notes: notes.trim() || null }).subscribe({
      next: () => {
        this.toast.success(`Captured to your ${kind} inbox.`);
        this.activeModal.close();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save — try again.'));
      },
    });
  }
}
