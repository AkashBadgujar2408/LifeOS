import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Where the steps send people. Checked against Mistral's console on 23/Oct/2026 (Session 94). */
export const MISTRAL_CONSOLE_URL = 'https://console.mistral.ai';
export const MISTRAL_KEYS_URL = 'https://console.mistral.ai/api-keys';

/**
 * Step by step: getting your own Mistral API key. Shown in Settings › AI assistant (open while there's no key) and
 * in the chat panel before one is set.
 */
@Component({
  selector: 'app-assistant-key-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="border rounded p-3 small" [open]="open()">
      <summary class="fw-semibold">How to get your Mistral API key (free, about 5 minutes)</summary>
      <ol class="mt-3 mb-3 ps-3 d-flex flex-column gap-2">
        <li>
          Open
          <a [href]="consoleUrl" target="_blank" rel="noopener noreferrer"
            >Mistral's console <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i
            ><span class="visually-hidden">(opens in a new tab)</span></a
          >
          and sign up or sign in (email, Google, Microsoft or Apple).
        </li>
        <li>
          If it asks for a plan, pick the <strong>free</strong> one — no card needed. Mistral may
          ask you to verify your phone number.
        </li>
        <li>
          In the left sidebar choose <strong>API Keys</strong> (<a
            [href]="keysUrl"
            target="_blank"
            rel="noopener noreferrer"
            >go straight there<span class="visually-hidden"> (opens in a new tab)</span></a
          >), then <strong>Create new key</strong>.
        </li>
        <li>
          Name it (for example "LifeOS") and pick an expiry date. If it asks about connectors,
          <strong>Shared connectors only</strong> is fine — LifeOS doesn't use them. Press
          <strong>Create new key</strong>.
        </li>
        <li>
          <strong>Copy the key straight away</strong> — Mistral shows it only once. If you lose it,
          just create another.
        </li>
        <li>
          Paste it into <strong>Your Mistral API key</strong> in Settings › AI assistant, press
          <strong>Save key</strong>, then <strong>Test key</strong>, and switch the assistant on.
        </li>
      </ol>
      <p class="fw-semibold mb-1">Good to know</p>
      <ul class="mb-0 ps-3 d-flex flex-column gap-1">
        <li>
          The key belongs to your Mistral account, and what the assistant asks counts against your
          plan. The free plan has rate limits (roughly one request a second and a monthly amount).
        </li>
        <li>
          On the free plan, Mistral's terms may let them use what's sent to improve their models.
          Under every answer, <strong>What was sent</strong> shows exactly what left LifeOS.
        </li>
        <li>
          LifeOS stores the key encrypted, never shows it again (only its last four characters) and
          leaves it out of data exports.
        </li>
        <li>
          To stop using it: <strong>Remove key</strong> here, and delete it in Mistral's console
          under API Keys.
        </li>
      </ul>
    </details>
  `,
})
export class AssistantKeyHelp {
  /** Whether the steps start expanded. */
  readonly open = input(true);

  protected readonly consoleUrl = MISTRAL_CONSOLE_URL;
  protected readonly keysUrl = MISTRAL_KEYS_URL;
}
