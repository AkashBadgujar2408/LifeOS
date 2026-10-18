import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DashboardService, Kpis } from '../../core/services/dashboard.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { openKpiPicker } from './kpi-picker';
import { kpiComparison, kpiValueText, visibleKpis } from './kpi-view';

/**
 * Personal KPI tiles on My Day: the figures the user picked (api/Dashboard/Kpis), each a number with a quiet word on
 * how it compares. Fetches itself for `today`; tiles of modules switched off in Settings are left out. Not a chart —
 * a handful of stat tiles, so no colour coding (direction is said in words).
 */
@Component({
  selector: 'app-kpi-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kpis(); as kpis) {
      <section class="card mb-3" aria-labelledby="kpi-heading">
        <div class="card-body p-4">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h2 id="kpi-heading" class="h5 mb-0">Your figures</h2>
            <button type="button" class="btn btn-link btn-sm p-0" (click)="choose()">
              <i class="bi bi-sliders" aria-hidden="true"></i>
              {{ tiles().length ? 'Change' : 'Choose figures' }}
            </button>
          </div>
          @if (tiles().length === 0) {
            <p class="text-body-secondary mb-0">
              Keep a few numbers in view — tasks done this week, habit consistency, days journaled.
              Pick the ones that matter to you.
            </p>
          } @else {
            <ul class="list-unstyled row row-cols-2 row-cols-md-3 g-3 mb-0">
              @for (tile of tiles(); track tile.key) {
                <li class="col">
                  <div class="kpi-tile h-100">
                    <div class="small text-body-secondary">{{ tile.label }}</div>
                    <div class="kpi-value">{{ valueText(tile.value, tile.unit) }}</div>
                    @if (comparison(tile); as text) {
                      <div class="small text-body-secondary">{{ text }}</div>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .kpi-tile {
      border-left: 2px solid var(--lifeos-border);
      padding-left: 0.75rem;
    }
    .kpi-value {
      font-family: Sora, sans-serif;
      font-size: 1.6rem;
      font-weight: 600;
      line-height: 1.2;
      color: var(--lifeos-ink);
    }
  `,
})
export class KpiTiles {
  private readonly dashboardService = inject(DashboardService);
  private readonly settingsService = inject(SettingsService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** The user's local date, "yyyy-MM-dd". */
  readonly today = input.required<string>();

  /** Null until loaded; a failed load leaves the card out (My Day has its own load error). */
  protected readonly kpis = signal<Kpis | null>(null);
  protected readonly tiles = computed(() =>
    visibleKpis(this.kpis()?.tiles ?? [], this.settingsService.hiddenModules()),
  );
  protected readonly valueText = kpiValueText;
  protected readonly comparison = kpiComparison;

  constructor() {
    effect(() => {
      const today = this.today();
      untracked(() => this.load(today));
    });
  }

  private load(today: string): void {
    this.dashboardService
      .getKpis(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (kpis) => this.kpis.set(kpis), error: () => undefined });
  }

  protected async choose(): Promise<void> {
    const kpis = this.kpis();
    if (!kpis) {
      return;
    }
    const hidden = this.settingsService.hiddenModules();
    const shown = this.tiles().map((t) => t.key);
    const keep = kpis.tiles.filter((t) => hidden.has(t.module)).map((t) => t.key);
    const saved = await openKpiPicker(this.modal, visibleKpis(kpis.available, hidden), shown, keep);
    if (saved) {
      this.toast.success('Figures saved.');
      this.load(this.today());
    }
  }
}
