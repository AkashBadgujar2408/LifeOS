import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { VaultAccess, VaultAction, VaultService } from '../../core/services/vault.service';
import { EntityOpener } from '../search/entity-opener';

const ACTION_TEXT: Record<VaultAction, { icon: string; text: string }> = {
  Unlocked: { icon: 'bi-unlock', text: 'Vault unlocked' },
  UnlockFailed: { icon: 'bi-x-octagon', text: 'Wrong password — vault stayed locked' },
  Opened: { icon: 'bi-file-earmark-lock', text: 'Opened' },
  Unprotected: { icon: 'bi-shield-x', text: 'Taken out of the vault' },
};

/** Settings › Vault activity: the latest unlocks and sensitive files opened (api/Shared/Vault/activity). */
@Component({
  selector: 'app-vault-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <section class="card" aria-labelledby="vault-activity-heading">
      <div class="card-body p-4">
        <h2 id="vault-activity-heading" class="h5 mb-1">Vault activity</h2>
        <p class="small text-body-secondary mb-3">
          Every unlock, every sensitive file opened and every document taken out of the vault — if
          something here wasn't you, change your password.
        </p>
        @if (loadFailed()) {
          <p class="small text-body-secondary mb-0">
            Couldn't load the vault activity.
            <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
              Try again
            </button>
          </p>
        } @else if (entries() === null) {
          <p class="small text-body-secondary mb-0">Loading...</p>
        } @else if (entries()!.length === 0) {
          <p class="small text-body-secondary mb-0">
            Nothing yet. Mark a document as sensitive to keep it in the vault.
          </p>
        } @else {
          <ul class="list-unstyled mb-0 d-flex flex-column gap-2 small">
            @for (entry of entries(); track entry.id) {
              <li class="d-flex gap-2">
                <i
                  class="bi {{ actionText[entry.action].icon }} text-body-secondary"
                  aria-hidden="true"
                ></i>
                <div class="min-w-0 flex-grow-1">
                  <div class="text-break">
                    {{ actionText[entry.action].text }}
                    @if (entry.detail) {
                      "{{ entry.detail }}"
                    }
                    @if (entry.entityType) {
                      @if (entry.entityTitle) {
                        —
                        <button
                          type="button"
                          class="btn btn-link btn-sm p-0 align-baseline"
                          (click)="open(entry)"
                        >
                          {{ entry.entityTitle }}
                        </button>
                      } @else {
                        <span class="text-body-secondary">— (deleted)</span>
                      }
                    }
                  </div>
                  <div class="text-body-secondary">
                    {{ entry.createdAt | date: dateTimeFormat }}
                    @if (entry.clientAddress) {
                      · from {{ entry.clientAddress }}
                    }
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
})
export class VaultActivity implements OnInit {
  private readonly vault = inject(VaultService);
  private readonly opener = inject(EntityOpener);

  protected readonly actionText = ACTION_TEXT;
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;
  protected readonly entries = signal<VaultAccess[] | null>(null);
  protected readonly loadFailed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.vault.activity().subscribe({
      next: (entries) => this.entries.set(entries),
      error: () => this.loadFailed.set(true),
    });
  }

  protected open(entry: VaultAccess): void {
    if (entry.entityType && entry.entityId !== null) {
      this.opener.open(entry.entityType, entry.entityId);
    }
  }
}
