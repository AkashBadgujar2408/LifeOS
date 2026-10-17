import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

/**
 * A freshly made set of recovery codes, shown once: the codes, plus copy and download so they end up somewhere safe.
 * Used right after registration and after making a new set in Settings.
 */
@Component({
  selector: 'app-recovery-codes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list-unstyled recovery-codes mb-3" aria-label="Recovery codes">
      @for (code of codes(); track code) {
        <li>{{ code }}</li>
      }
    </ul>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-outline-primary" (click)="copy()">
        <i class="bi" [class]="copied() ? 'bi-check2' : 'bi-clipboard'"></i>
        {{ copied() ? 'Copied' : 'Copy all' }}
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary" (click)="download()">
        <i class="bi bi-download"></i> Download as a text file
      </button>
    </div>
  `,
  styles: `
    .recovery-codes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
      gap: 0.4rem 1rem;
      padding: 0.85rem 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      background: var(--lifeos-canvas);
      border: 1px solid var(--lifeos-border);
      border-radius: 0.5rem;
    }
  `,
})
export class RecoveryCodes {
  private readonly toast = inject(ToastService);

  readonly codes = input.required<string[]>();
  /** Whose codes they are, for the downloaded file. */
  readonly username = input<string>('');

  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codes().join('\n'));
      this.copied.set(true);
    } catch {
      this.toast.error("Couldn't copy. Select the codes and copy them, or download the file.");
    }
  }

  protected download(): void {
    const lines = [
      `LifeOS recovery codes${this.username() ? ` for ${this.username()}` : ''}`,
      'Each one resets your password once. Keep them somewhere safe.',
      '',
      ...this.codes(),
      '',
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lifeos-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }
}
