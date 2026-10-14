import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InboxKind } from '../../../core/services/inbox.service';
import { QuickAddService } from '../../../core/services/quick-add.service';

/** Route `data` for a module that's in the nav but not built yet (bound to inputs via withComponentInputBinding). */
export interface ModulePlaceholderData {
  heading: string;
  icon: string;
  summary: string;
  willLetYou: string[];
  /** If set, the empty state offers to capture this kind into the Inbox until the module exists. */
  captureKind?: InboxKind;
}

/**
 * Empty state for nav entries whose module hasn't been built yet, so the nav has no dead links. Each one is
 * replaced by the real feature route when that module's session lands.
 */
@Component({
  selector: 'app-module-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './module-placeholder.html',
})
export class ModulePlaceholder {
  protected readonly quickAdd = inject(QuickAddService);

  readonly heading = input.required<string>();
  readonly icon = input.required<string>();
  readonly summary = input.required<string>();
  readonly willLetYou = input.required<string[]>();
  readonly captureKind = input<InboxKind>();

  protected readonly captureLabel = computed(() =>
    this.captureKind() === 'Journal'
      ? 'Write a journal entry'
      : `Capture a ${this.captureKind()?.toLowerCase()}`,
  );
}
