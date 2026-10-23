import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  AssistantKeyTest,
  AssistantService,
  AssistantSettings,
} from '../../core/services/assistant.service';
import { ToastService } from '../../core/services/toast.service';
import { AssistantKeyHelp } from './key-help';

/**
 * Settings › AI assistant: the user's own Mistral API key (write-only — the page only ever learns its last four),
 * the step-by-step help for getting one, Test key, the model and the on/off switch.
 */
@Component({
  selector: 'app-assistant-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, AssistantKeyHelp],
  template: `
    <section class="card" aria-labelledby="assistant-heading">
      <div class="card-body p-4">
        <h2 id="assistant-heading" class="h5 mb-1">AI assistant</h2>
        <p class="small text-body-secondary mb-3">
          Ask about your own LifeOS data in plain words — "what's due this week?", "how is my
          savings goal doing?". It runs on <strong>your own Mistral API key</strong>, so you decide
          whether anything is sent at all. It only answers questions about LifeOS, and can't change
          anything.
        </p>

        @if (loadFailed()) {
          <p class="small text-body-secondary mb-0">
            Couldn't load the assistant settings.
            <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">
              Try again
            </button>
          </p>
        } @else if (settings(); as s) {
          <div class="mb-3">
            <app-assistant-key-help [open]="!s.hasKey" />
          </div>

          @if (s.hasKey) {
            <p class="small mb-2" data-testid="key-status">
              <i class="bi bi-key text-body-secondary" aria-hidden="true"></i>
              Key set, ending <strong>…{{ s.keyLast4 }}</strong
              >, added {{ s.keySetAt | date }}.
            </p>
          }

          <form [formGroup]="keyForm" (ngSubmit)="saveKey()" novalidate>
            <label for="assistant-key" class="form-label">
              {{ s.hasKey ? 'Replace your Mistral API key' : 'Your Mistral API key' }}
            </label>
            <div class="d-flex flex-wrap gap-2">
              <input
                id="assistant-key"
                type="password"
                class="form-control flex-grow-1"
                style="max-width: 28rem"
                formControlName="apiKey"
                autocomplete="off"
                spellcheck="false"
                placeholder="Paste the key you copied from Mistral"
                [class.is-invalid]="fieldError('apiKey')"
              />
              <button type="submit" class="btn btn-primary" [disabled]="busy()">Save key</button>
            </div>
            @if (fieldError('apiKey'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </form>

          @if (s.hasKey) {
            <div class="d-flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                class="btn btn-outline-primary"
                [disabled]="busy()"
                (click)="test()"
              >
                <i class="bi bi-plug" aria-hidden="true"></i> Test key
              </button>
              <button
                type="button"
                class="btn btn-outline-danger"
                [disabled]="busy()"
                (click)="removeKey()"
              >
                Remove key
              </button>
            </div>
            @if (testResult(); as result) {
              <div
                class="small mt-2"
                [class.text-success]="result.works"
                [class.text-danger]="!result.works"
                role="status"
              >
                <i
                  class="bi"
                  [class.bi-check-circle]="result.works"
                  [class.bi-x-circle]="!result.works"
                  aria-hidden="true"
                ></i>
                {{ result.message }}
              </div>
            }

            <hr />
            <div class="form-check form-switch mb-3">
              <input
                id="assistant-enabled"
                class="form-check-input"
                type="checkbox"
                role="switch"
                [checked]="s.isEnabled"
                [disabled]="busy()"
                (change)="setEnabled($any($event.target))"
              />
              <label class="form-check-label" for="assistant-enabled">
                Assistant on — the chat button in the sidebar can ask Mistral
              </label>
            </div>
            <label for="assistant-model" class="form-label">Model</label>
            <select
              id="assistant-model"
              class="form-select"
              style="max-width: 28rem"
              [disabled]="busy()"
              (change)="setModel($any($event.target))"
            >
              @for (model of s.models; track model.id) {
                <option [value]="model.id" [selected]="model.id === s.model">
                  {{ model.label }}
                </option>
              }
            </select>
            <div class="form-text">
              Chosen for their higher free-plan rate limits. Ministral 8B gives the best answers;
              switch to 3B if you still hit a limit.
            </div>
          }
        } @else {
          <p class="small text-body-secondary mb-0">Loading...</p>
        }
      </div>
    </section>
  `,
})
export class AssistantSettingsSection implements OnInit {
  private readonly assistant = inject(AssistantService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly settings = signal<AssistantSettings | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly busy = signal(false);
  protected readonly testResult = signal<AssistantKeyTest | null>(null);
  private readonly serverError = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly keyForm = this.fb.nonNullable.group({
    apiKey: ['', Validators.required],
  });

  ngOnInit(): void {
    this.load();
    this.keyForm.controls.apiKey.valueChanges.subscribe(() => this.serverError.set(null));
    // The chat panel links here (/settings#assistant-heading); the page renders late, so scroll once it has.
    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fragment) => {
      if (fragment === 'assistant-heading') {
        setTimeout(() =>
          document.getElementById('assistant-heading')?.scrollIntoView({ block: 'start' }),
        );
      }
    });
  }

  load(): void {
    this.loadFailed.set(false);
    this.assistant.settings().subscribe({
      next: (settings) => this.settings.set(settings),
      error: () => this.loadFailed.set(true),
    });
  }

  protected fieldError(name: 'apiKey'): string | null {
    const control = this.keyForm.controls[name];
    if (this.serverError()) {
      return this.serverError();
    }
    // Only after Save key is pressed: an empty "replace" box after a save isn't a mistake.
    return this.submitted() && control.hasError('required') ? 'Paste your Mistral API key.' : null;
  }

  protected saveKey(): void {
    this.submitted.set(true);
    if (this.keyForm.invalid) {
      return;
    }

    this.busy.set(true);
    this.assistant.saveKey(this.keyForm.controls.apiKey.value).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.keyForm.reset();
        this.submitted.set(false);
        this.busy.set(false);
        this.toast.success('Key saved. Press Test key to check it with Mistral.');
        this.testResult.set(null);
      },
      error: (err) => {
        this.busy.set(false);
        this.serverError.set(apiErrorMessage(err, 'Could not save the key.'));
      },
    });
  }

  protected test(): void {
    this.busy.set(true);
    this.testResult.set(null);
    this.assistant.testKey().subscribe({
      next: (result) => {
        this.busy.set(false);
        this.testResult.set(result);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not test the key.'));
      },
    });
  }

  protected async removeKey(): Promise<void> {
    const answer = await Swal.fire({
      title: 'Remove your Mistral key?',
      text: 'The assistant switches off until you add a key again. To stop the key working anywhere, also delete it in Mistral’s console.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove key',
      confirmButtonColor: 'var(--cui-danger)',
    });
    if (!answer.isConfirmed) {
      return;
    }

    this.busy.set(true);
    this.assistant.removeKey().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.testResult.set(null);
        this.busy.set(false);
        this.toast.success('Key removed.');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not remove the key.'));
      },
    });
  }

  protected setEnabled(input: HTMLInputElement): void {
    const isEnabled = input.checked;
    this.savePreferences(
      isEnabled,
      this.settings()!.model,
      isEnabled ? 'Assistant switched on.' : 'Assistant switched off.',
      () => (input.checked = !isEnabled),
    );
  }

  protected setModel(select: HTMLSelectElement): void {
    const previous = this.settings()!.model;
    this.savePreferences(this.settings()!.isEnabled, select.value, 'Model saved.', () => {
      select.value = previous;
    });
  }

  /** Saves on/off + model; on failure `undo` puts the control back to what's stored. */
  private savePreferences(
    isEnabled: boolean,
    model: string,
    saved: string,
    undo: () => void,
  ): void {
    this.busy.set(true);
    this.assistant.updatePreferences(isEnabled, model).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.busy.set(false);
        this.toast.success(saved);
      },
      error: (err) => {
        this.busy.set(false);
        undo();
        this.toast.error(apiErrorMessage(err, 'Could not save the assistant settings.'));
      },
    });
  }
}
