import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SettingsService } from '../../../core/services/settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { INBOX_KINDS, InboxKind, InboxService } from '../../../core/services/inbox.service';
import { apiErrorMessage } from '../../../core/services/api-error';
import { AssistantService } from '../../../core/services/assistant.service';
import { AssistantPanelService } from '../../../core/services/assistant-panel.service';

/** Mirrors AssistantRules.MaxMessageLength. */
const MAX_ASK_LENGTH = 2000;

const KIND_META: Record<InboxKind, { icon: string; placeholder: string }> = {
  Task: { icon: 'bi-check2-square', placeholder: 'e.g. Renew passport' },
  Note: { icon: 'bi-sticky', placeholder: 'e.g. Wi-Fi password for the new router' },
  Journal: { icon: 'bi-journal-text', placeholder: 'e.g. Great run this morning, felt strong' },
  Idea: { icon: 'bi-lightbulb', placeholder: 'e.g. Watch Severance, or build a recipe tracker' },
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
  private readonly modal = inject(NgbModal);
  private readonly settingsService = inject(SettingsService);
  private readonly assistantPanel = inject(AssistantPanelService);

  protected readonly kinds = INBOX_KINDS;
  protected readonly kindMeta = KIND_META;
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    kind: ['Task' as InboxKind, Validators.required],
    title: ['', [Validators.required, Validators.maxLength(300)]],
    notes: ['', Validators.maxLength(4000)],
  });

  /** "Ask the assistant" shows only once the user's key is set and the assistant is on. */
  protected readonly assistantOn = signal(false);
  protected readonly askLine = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_ASK_LENGTH)],
  });
  private readonly askTried = signal(false);

  constructor() {
    inject(AssistantService)
      .settings()
      .subscribe({
        next: (settings) => this.assistantOn.set(settings.hasKey && settings.isEnabled),
        // No assistant line when its settings can't be read — Quick Add itself still works.
        error: () => this.assistantOn.set(false),
      });
  }

  protected askError(): string | null {
    if (!this.askTried()) {
      return null;
    }
    if (!this.askLine.value.trim()) {
      return 'Type what to add, e.g. lunch with Sam tomorrow 1 pm.';
    }
    return this.askLine.hasError('maxlength')
      ? `Keep it under ${MAX_ASK_LENGTH} characters.`
      : null;
  }

  /**
   * Natural-language Quick Add: the line goes to the assistant's chat, which answers with a confirmation card —
   * nothing is saved until Confirm there.
   */
  protected ask(): void {
    this.askTried.set(true);
    const text = this.askLine.value.trim();
    if (!text || this.askLine.invalid) {
      return;
    }
    this.activeModal.dismiss();
    void this.assistantPanel.open(text);
  }

  protected readonly financeOn = computed(
    () => !this.settingsService.hiddenModules().has('Finance'),
  );

  /**
   * An expense isn't an inbox note — it needs an amount and an account — so this swaps Quick Add for the
   * transaction editor (loaded only when asked for, to keep it out of the shell's bundle).
   */
  protected async logExpense(): Promise<void> {
    this.activeModal.dismiss();
    const { openTransactionEditor } = await import('../../../features/finance/transaction-editor');
    const result = await openTransactionEditor(this.modal, { kind: 'Expense' });
    if (result?.kind === 'saved') {
      this.toast.success('Expense saved.');
    }
  }

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
