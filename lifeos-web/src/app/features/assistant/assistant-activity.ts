import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { APP_DATE_TIME_FORMAT } from '../../core/dates/date-format';
import { ActionLogEntry, AssistantService } from '../../core/services/assistant.service';
import { openSavedItem } from './assistant-open';

/** Settings › AI assistant: every create/update the assistant saved (after Confirm), newest first, each linking to the item. */
@Component({
  selector: 'app-assistant-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <h3 class="h6 mb-1">What the assistant saved</h3>
    <p class="small text-body-secondary mb-2">
      Everything it created or changed after you pressed Confirm. It can't delete anything.
    </p>
    @if (loadFailed()) {
      <p class="small text-body-secondary mb-0">
        Couldn't load this.
        <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
          Try again
        </button>
      </p>
    } @else if (entries(); as list) {
      @if (list.length === 0) {
        <p class="small text-body-secondary mb-0">Nothing yet.</p>
      } @else {
        <ul class="list-unstyled small mb-0">
          @for (entry of list; track entry.id) {
            <li class="d-flex flex-wrap align-items-baseline gap-2 py-1 border-bottom">
              <span class="badge text-bg-light border">{{ entry.kind }}</span>
              <button
                type="button"
                class="btn btn-link btn-sm p-0 text-start min-w-0"
                (click)="open(entry)"
              >
                {{ entry.summary }}
              </button>
              <span class="text-body-secondary ms-auto">{{
                entry.createdAt | date: dateTimeFormat
              }}</span>
            </li>
          }
        </ul>
      }
    } @else {
      <p class="small text-body-secondary mb-0">Loading...</p>
    }
  `,
})
export class AssistantActivity implements OnInit {
  private readonly assistant = inject(AssistantService);
  private readonly injector = inject(Injector);

  protected readonly entries = signal<ActionLogEntry[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly dateTimeFormat = APP_DATE_TIME_FORMAT;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);
    this.assistant.actionLog().subscribe({
      next: (entries) => this.entries.set(entries),
      error: () => this.loadFailed.set(true),
    });
  }

  protected open(entry: ActionLogEntry): void {
    void openSavedItem(this.injector, entry.entityType, entry.entityId);
  }
}
