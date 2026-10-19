import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { saveBlob } from '../../core/files/files';
import { todayIso } from '../../core/dates/today';
import { AccountDataService, ImportSummary } from '../../core/services/account-data.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { VaultService } from '../../core/services/vault.service';
import { ensureVaultUnlocked } from '../../shared/components/vault-unlock/vault-unlock';

/**
 * Your data, all of it (Blueprint principle 9): download everything as one zip, bring an export into a fresh
 * account, or erase the account for good — the one thing in LifeOS that's really deleted rather than hidden.
 */
@Component({
  selector: 'app-your-data',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <section class="card">
      <div class="card-body">
        <h2 class="h5">Your data</h2>
        <p class="small text-body-secondary">
          Everything you've put into LifeOS is yours to take with you.
        </p>

        <h3 class="h6 mt-3">Download everything</h3>
        <p class="small mb-2">
          One .zip with every table as JSON (what an import reads back) and CSV (for spreadsheets),
          plus your document files and attachments. Vault documents and health records are included
          unlocked — keep the file somewhere safe.
        </p>
        <button
          type="button"
          class="btn btn-outline-primary"
          [disabled]="exporting()"
          (click)="download()"
        >
          <i class="bi bi-download"></i> {{ exporting() ? 'Preparing…' : 'Download my data' }}
        </button>

        <h3 class="h6 mt-4">Bring in an export</h3>
        <p class="small mb-2">
          Moving from another LifeOS? Import its export here. This only works on an account that's
          still empty.
        </p>
        <div class="input-group">
          <input
            id="your-data-import"
            type="file"
            class="form-control"
            accept=".zip,application/zip"
            aria-label="LifeOS export to import"
            (change)="chooseFile($event)"
          />
          <button
            type="button"
            class="btn btn-outline-primary"
            [disabled]="!importFile() || importing()"
            (click)="importNow()"
          >
            {{ importing() ? 'Importing…' : 'Import' }}
          </button>
        </div>
        @if (summary(); as s) {
          <p class="small text-success-emphasis mt-2 mb-0">
            <i class="bi bi-check-circle"></i> Brought in {{ s.rows }}
            {{ s.rows === 1 ? 'item' : 'items' }} across {{ s.tables.length }}
            {{ s.tables.length === 1 ? 'list' : 'lists' }}, and {{ s.files }}
            {{ s.files === 1 ? 'file' : 'files' }}.
            @if (s.filesMissing) {
              {{ s.filesMissing }} file(s) weren't in the export and were left out.
            }
            <!-- A full page load, so settings, reminders and every list start from the imported data. -->
            <a href="/" class="ms-1">Open My Day</a>
          </p>
        }

        <div class="border border-danger-subtle rounded p-3 mt-4">
          <h3 class="h6 text-danger-emphasis">Delete my account</h3>
          <p class="small mb-2">
            Erases your account and everything in it — goals, tasks, journal, money, documents and
            their files — for good. It can't be undone; download your data first if you might want
            it.
          </p>
          <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()" novalidate class="row g-2">
            <div class="col-sm-6">
              <label class="form-label small" for="delete-confirm">
                Type your username (<strong>{{ username() }}</strong
                >)
              </label>
              <input
                id="delete-confirm"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('confirmation')"
                formControlName="confirmation"
                [placeholder]="username()"
                autocomplete="off"
              />
              @if (fieldError('confirmation'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div class="col-sm-6">
              <label class="form-label small" for="delete-password">Your password</label>
              <input
                id="delete-password"
                type="password"
                class="form-control"
                [class.is-invalid]="fieldError('password')"
                formControlName="password"
                placeholder="Your current password"
                autocomplete="current-password"
              />
              @if (fieldError('password'); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-danger" [disabled]="deleting()">
                <i class="bi bi-trash"></i> Delete my account for good
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `,
})
export class YourData {
  readonly username = input.required<string>();

  private readonly accountData = inject(AccountDataService);
  private readonly vault = inject(VaultService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly deleting = signal(false);
  protected readonly importFile = signal<File | null>(null);
  protected readonly summary = signal<ImportSummary | null>(null);
  protected readonly deleteForm = inject(FormBuilder).nonNullable.group({
    confirmation: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected fieldError(name: 'confirmation' | 'password'): string | null {
    const control = this.deleteForm.controls[name];
    if (!control.touched) {
      return null;
    }
    if (name === 'confirmation') {
      return control.value.trim() === this.username()
        ? null
        : `Type ${this.username()} exactly to confirm.`;
    }
    return control.errors ? 'Enter your password.' : null;
  }

  protected download(): void {
    this.exporting.set(true);
    this.accountData.export().subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `lifeos-export-${todayIso()}.zip`);
      },
      error: async (err: HttpErrorResponse) => {
        this.exporting.set(false);
        if (err.status === 423) {
          this.vault.lock();
          const unlocked = await ensureVaultUnlocked(
            this.modal,
            this.vault,
            'Your export includes vault documents or health records.',
          );
          if (unlocked) {
            this.download();
          }
          return;
        }
        this.toast.error(apiErrorMessage(err, 'Could not prepare your export.'));
      },
    });
  }

  protected chooseFile(event: Event): void {
    this.importFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.summary.set(null);
  }

  protected async importNow(): Promise<void> {
    const file = this.importFile();
    if (!file) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Import "${file.name}"?`,
      text: 'Everything in the export is added to this account.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Import',
      confirmButtonColor: 'var(--lifeos-teal)',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.importing.set(true);
    this.accountData.import(file).subscribe({
      next: (summary) => {
        this.importing.set(false);
        this.summary.set(summary);
        this.toast.success('Your data is in.');
      },
      error: (err) => {
        this.importing.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not import that export.'));
      },
    });
  }

  protected async deleteAccount(): Promise<void> {
    this.deleteForm.markAllAsTouched();
    if (this.deleteForm.invalid || this.fieldError('confirmation')) {
      return;
    }
    const confirmed = await Swal.fire({
      title: 'Delete your account for good?',
      text: 'Everything goes, now, and there is no way back.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete everything',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    const { password, confirmation } = this.deleteForm.getRawValue();
    this.deleting.set(true);
    this.accountData.deleteAccount(password, confirmation.trim()).subscribe({
      next: () => {
        this.auth.logout();
        this.toast.success('Your account and everything in it has been deleted.');
        void this.router.navigate(['/login']);
      },
      error: (err) => {
        this.deleting.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not delete the account.'));
      },
    });
  }
}
