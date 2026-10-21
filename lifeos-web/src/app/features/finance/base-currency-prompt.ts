import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import { apiErrorMessage } from '../../core/services/api-error';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';

/**
 * Shown on the Finance pages until a base currency is chosen: totals are reported in it, so it's asked for here
 * rather than sending you off to Settings. Saves through the same preferences call (the stored values + this one).
 */
@Component({
  selector: 'app-base-currency-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgOptionComponent, NgSelectComponent],
  template: `
    @if (needed()) {
      <div class="card mb-4">
        <div class="card-body d-flex flex-wrap align-items-end gap-3">
          <div class="flex-grow-1">
            <h2 class="h6 mb-1">Which currency do you think in?</h2>
            <p class="small text-body-secondary mb-0">
              Totals and budgets are reported in it; anything in another currency takes a rate.
            </p>
          </div>
          <div class="d-flex gap-2">
            <label class="visually-hidden" for="base-currency">Base currency</label>
            <ng-select
              labelForId="base-currency"
              [ngModel]="code()"
              (ngModelChange)="code.set($event)"
              placeholder="Choose…"
              [clearable]="false"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
              }
            </ng-select>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!code() || saving()"
              (click)="save()"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class BaseCurrencyPrompt {
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly needed = computed(() => {
    const settings = this.settingsService.settings();
    return settings !== null && settings.baseCurrency === null;
  });
  protected readonly saving = signal(false);
  protected readonly code = signal('');

  protected save(): void {
    const settings = this.settingsService.settings();
    const code = this.code();
    if (!settings || !code) {
      return;
    }
    this.saving.set(true);
    this.settingsService
      .updatePreferences({
        timeZone: settings.timeZone,
        baseCurrency: code,
        hiddenModules: settings.hiddenModules,
        hiddenLifeAreaIds: settings.hiddenLifeAreaIds,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success(`Money is reported in ${code}.`);
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the currency.'));
        },
      });
  }
}
