import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, debounceTime, forkJoin, map, of, switchMap } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import {
  Account,
  FinanceService,
  Scenario,
  ScenarioImpact,
  ScenarioLine,
  ScenarioLineKind,
} from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { BaseCurrencyPrompt } from './base-currency-prompt';
import { formatMoney } from './finance-view';
import { ScenarioImpactView } from './scenario-impact';
import {
  SCENARIO_KINDS,
  SCENARIO_KIND_LABELS,
  goalShiftText,
  isMonthlyKind,
  monthsText,
  readAffordPrefill,
} from './scenario-view';

type LineForm = FormGroup<{
  kind: FormControl<ScenarioLineKind>;
  title: FormControl<string>;
  amount: FormControl<number | null>;
  startsOn: FormControl<string | null>;
  endsOn: FormControl<string | null>;
  accountId: FormControl<number | null>;
  annualRate: FormControl<number | null>;
  termMonths: FormControl<number | null>;
}>;

type LineField = 'title' | 'amount' | 'startsOn' | 'endsOn' | 'annualRate' | 'termMonths';

const MAX_COMPARE = 3;

/**
 * "Can I afford it?" — what-ifs (a purchase, a monthly cost or income, a pay change, a loan) run against the real
 * forecast, savings goals and retirement plan, before → after. Nothing here ever writes a transaction: the impact is
 * computed by the server per request; only the scenario's lines are saved, so it can be rerun and compared later.
 */
@Component({
  selector: 'app-finance-scenarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LoadError,
    BaseCurrencyPrompt,
    ScenarioImpactView,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <div class="container py-4">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Can I afford it?</h1>
          <p class="text-body-secondary mb-0 small">
            Try a purchase, a new cost or a pay change against your real forecast, goals and
            retirement plan — nothing is recorded in your money.
          </p>
        </div>
        <button type="button" class="btn btn-outline-primary" (click)="startNew()">
          <i class="bi bi-plus-lg me-1"></i>New scenario
        </button>
      </div>

      <app-base-currency-prompt />

      @if (loadFailed() && !loaded()) {
        <app-load-error message="Couldn't load your scenarios." (retry)="load()" />
      } @else if (loaded()) {
        <div class="row g-4">
          <div class="col-lg-5 order-2 order-lg-1">
            <section class="card mb-3" aria-labelledby="scenarios-saved">
              <div class="card-body">
                <h2 id="scenarios-saved" class="h5">Saved scenarios</h2>
                @if (scenarios().length === 0) {
                  <p class="small text-body-secondary mb-0">
                    None yet. Build one on the right and save it to come back to it, or to compare
                    it with others.
                  </p>
                } @else {
                  <ul class="list-unstyled mb-0">
                    @for (s of scenarios(); track s.id) {
                      <li class="py-2 border-bottom d-flex gap-2 align-items-start">
                        <input
                          class="form-check-input mt-1 flex-shrink-0"
                          type="checkbox"
                          [id]="'compare-' + s.id"
                          [checked]="compareIds().includes(s.id)"
                          [disabled]="
                            !compareIds().includes(s.id) && compareIds().length >= maxCompare
                          "
                          (change)="toggleCompare(s.id)"
                          [attr.aria-label]="'Compare ' + s.name"
                        />
                        <div class="min-w-0 flex-grow-1">
                          <button
                            type="button"
                            class="btn btn-link p-0 fw-semibold link-body-emphasis text-decoration-none text-start text-break"
                            [class.text-decoration-underline]="editingId() === s.id"
                            (click)="open(s)"
                          >
                            {{ s.name }}
                          </button>
                          <div class="small text-body-secondary text-break">
                            {{ summary(s) }}
                          </div>
                          @if (impacts()[s.id]; as i) {
                            @if (i.lows[0]; as low) {
                              <div
                                class="small"
                                [class.text-danger-emphasis]="low.after.balance < 0"
                              >
                                Lowest {{ money(low.after.balance, i.baseCurrency) }}
                                <span class="text-body-secondary">
                                  (now {{ money(low.before.balance, i.baseCurrency) }})
                                </span>
                              </div>
                            }
                          }
                        </div>
                      </li>
                    }
                  </ul>
                  <p class="small text-body-secondary mt-2 mb-0">
                    Tick up to {{ maxCompare }} to compare them side by side.
                  </p>
                }
              </div>
            </section>

            @if (compared().length >= 2) {
              <section class="card" aria-labelledby="scenarios-compare">
                <div class="card-body">
                  <h2 id="scenarios-compare" class="h5">Side by side</h2>
                  <div class="table-responsive">
                    <table class="table table-sm small align-middle mb-0">
                      <thead>
                        <tr>
                          <th scope="col"></th>
                          @for (c of compared(); track c.scenario.id) {
                            <th scope="col" class="text-end text-break">{{ c.scenario.name }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row" class="fw-normal">Lowest balance</th>
                          @for (c of compared(); track c.scenario.id) {
                            <td
                              class="text-end"
                              [class.text-danger-emphasis]="
                                (c.impact.lows[0]?.after?.balance ?? 0) < 0
                              "
                            >
                              {{
                                c.impact.lows[0]
                                  ? money(c.impact.lows[0].after.balance, c.impact.baseCurrency)
                                  : '—'
                              }}
                            </td>
                          }
                        </tr>
                        <tr>
                          <th scope="row" class="fw-normal">Next 12 months</th>
                          @for (c of compared(); track c.scenario.id) {
                            <td class="text-end">
                              {{ money(c.impact.nextTwelveMonths, c.impact.baseCurrency) }}
                            </td>
                          }
                        </tr>
                        @for (g of comparedGoals(); track g.goalId) {
                          <tr>
                            <th scope="row" class="fw-normal text-break">{{ g.title }}</th>
                            @for (c of compared(); track c.scenario.id) {
                              <td class="text-end">{{ goalCell(c.impact, g.goalId) }}</td>
                            }
                          </tr>
                        }
                        <tr>
                          <th scope="row" class="fw-normal">Enough to retire by</th>
                          @for (c of compared(); track c.scenario.id) {
                            <td class="text-end">
                              {{
                                c.impact.retirement
                                  ? (c.impact.retirement.ageAfter ?? 'not by 100')
                                  : '—'
                              }}
                            </td>
                          }
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            }
          </div>

          <div class="col-lg-7 order-1 order-lg-2">
            <section class="card mb-3" aria-labelledby="scenario-editor">
              <div class="card-body">
                <h2 id="scenario-editor" class="h5">
                  {{ editingId() ? 'Edit scenario' : 'New scenario' }}
                </h2>
                @if (prefillNote(); as note) {
                  <p class="small text-warning-emphasis">{{ note }}</p>
                }
                <form [formGroup]="form" (ngSubmit)="save()" novalidate>
                  <div class="row g-3 mb-3">
                    <div class="col-sm-6">
                      <label class="form-label" for="scenario-name">Name</label>
                      <input
                        id="scenario-name"
                        class="form-control"
                        formControlName="name"
                        maxlength="200"
                        placeholder="e.g. New car next spring"
                        [class.is-invalid]="nameError()"
                      />
                      @if (nameError(); as error) {
                        <div class="invalid-feedback d-block">{{ error }}</div>
                      }
                    </div>
                    <div class="col-sm-6">
                      <label class="form-label" for="scenario-notes"
                        >Notes <span class="text-body-secondary small">(optional)</span></label
                      >
                      <input
                        id="scenario-notes"
                        class="form-control"
                        formControlName="notes"
                        maxlength="2000"
                        placeholder="e.g. Hatchback, on-road price"
                      />
                    </div>
                  </div>

                  <h3 class="h6">What if…</h3>
                  @for (line of lines.controls; track line; let i = $index) {
                    <fieldset class="border rounded p-3 mb-3" [formGroup]="line">
                      <legend class="float-none w-auto fs-6 px-1 mb-0">
                        {{ kindLabels[line.controls.kind.value] }}
                      </legend>
                      <div class="row g-2">
                        <div class="col-sm-6">
                          <label class="form-label small" [for]="'line-title-' + i">What</label>
                          <input
                            [id]="'line-title-' + i"
                            class="form-control form-control-sm"
                            formControlName="title"
                            maxlength="200"
                            [placeholder]="'e.g. ' + placeholderFor(line.controls.kind.value)"
                            [class.is-invalid]="lineError(i, 'title')"
                          />
                          @if (lineError(i, 'title'); as error) {
                            <div class="invalid-feedback d-block">{{ error }}</div>
                          }
                        </div>
                        <div class="col-sm-6">
                          <label class="form-label small" [for]="'line-amount-' + i">{{
                            amountLabelFor(line.controls.kind.value)
                          }}</label>
                          <input
                            [id]="'line-amount-' + i"
                            type="number"
                            step="any"
                            class="form-control form-control-sm"
                            formControlName="amount"
                            [placeholder]="
                              line.controls.kind.value === 'PayChange' ? 'e.g. -5000' : 'e.g. 50000'
                            "
                            [class.is-invalid]="lineError(i, 'amount')"
                          />
                          @if (lineError(i, 'amount'); as error) {
                            <div class="invalid-feedback d-block">{{ error }}</div>
                          }
                        </div>
                        <div class="col-sm-6">
                          <label class="form-label small" [for]="'line-starts-' + i">{{
                            line.controls.kind.value === 'Purchase'
                              ? 'When'
                              : line.controls.kind.value === 'Loan'
                                ? 'Taken on'
                                : 'From'
                          }}</label>
                          <div class="input-group input-group-sm">
                            <input
                              [id]="'line-starts-' + i"
                              type="text"
                              class="form-control"
                              formControlName="startsOn"
                              placeholder="e.g. 01/Dec/2026"
                              autocomplete="off"
                              ngbDatepicker
                              #startsPicker="ngbDatepicker"
                              container="body"
                              [class.is-invalid]="lineError(i, 'startsOn')"
                            />
                            <button
                              type="button"
                              class="btn btn-outline-secondary"
                              aria-label="Pick the day"
                              (click)="startsPicker.toggle()"
                            >
                              <i class="bi bi-calendar3"></i>
                            </button>
                          </div>
                          @if (lineError(i, 'startsOn'); as error) {
                            <div class="invalid-feedback d-block">{{ error }}</div>
                          }
                        </div>
                        @if (isMonthly(line.controls.kind.value)) {
                          <div class="col-sm-6">
                            <label class="form-label small" [for]="'line-ends-' + i"
                              >Until <span class="text-body-secondary">(optional)</span></label
                            >
                            <div class="input-group input-group-sm">
                              <input
                                [id]="'line-ends-' + i"
                                type="text"
                                class="form-control"
                                formControlName="endsOn"
                                placeholder="Leave blank: it carries on"
                                autocomplete="off"
                                ngbDatepicker
                                #endsPicker="ngbDatepicker"
                                container="body"
                                [class.is-invalid]="lineError(i, 'endsOn')"
                              />
                              <button
                                type="button"
                                class="btn btn-outline-secondary"
                                aria-label="Pick the last month"
                                (click)="endsPicker.toggle()"
                              >
                                <i class="bi bi-calendar3"></i>
                              </button>
                            </div>
                            @if (lineError(i, 'endsOn'); as error) {
                              <div class="invalid-feedback d-block">{{ error }}</div>
                            }
                          </div>
                        }
                        @if (line.controls.kind.value === 'Loan') {
                          <div class="col-6 col-sm-3">
                            <label class="form-label small" [for]="'line-rate-' + i"
                              >Rate (% a year)</label
                            >
                            <input
                              [id]="'line-rate-' + i"
                              type="number"
                              step="0.01"
                              class="form-control form-control-sm"
                              formControlName="annualRate"
                              placeholder="e.g. 9"
                              [class.is-invalid]="lineError(i, 'annualRate')"
                            />
                            @if (lineError(i, 'annualRate'); as error) {
                              <div class="invalid-feedback d-block">{{ error }}</div>
                            }
                          </div>
                          <div class="col-6 col-sm-3">
                            <label class="form-label small" [for]="'line-term-' + i">Months</label>
                            <input
                              [id]="'line-term-' + i"
                              type="number"
                              step="1"
                              class="form-control form-control-sm"
                              formControlName="termMonths"
                              placeholder="e.g. 60"
                              [class.is-invalid]="lineError(i, 'termMonths')"
                            />
                            @if (lineError(i, 'termMonths'); as error) {
                              <div class="invalid-feedback d-block">{{ error }}</div>
                            }
                          </div>
                        }
                        <div class="col-sm-6">
                          <label class="form-label small" [for]="'line-account-' + i"
                            >Account <span class="text-body-secondary">(optional)</span></label
                          >
                          <ng-select
                            [id]="'line-account-' + i"
                            class="ng-select-sm"
                            formControlName="accountId"
                            placeholder="Not a particular account"
                          >
                            @for (a of accountOptions(); track a.id) {
                              <ng-option [value]="a.id">
                                {{ a.name }}
                              </ng-option>
                            }
                          </ng-select>
                        </div>
                      </div>
                      @if (line.controls.kind.value === 'Loan') {
                        <p class="small text-body-secondary mt-2 mb-0">
                          The loan pays for what it's taken for — only its EMIs come out of your
                          money. Add the down payment as a purchase.
                        </p>
                      }
                      <div class="text-end mt-2">
                        <button
                          type="button"
                          class="btn btn-link btn-sm link-danger p-0"
                          (click)="removeLine(i)"
                        >
                          Remove
                        </button>
                      </div>
                    </fieldset>
                  }
                  @if (linesError(); as error) {
                    <div class="invalid-feedback d-block mb-2">{{ error }}</div>
                  }
                  <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Add a what-if">
                    @for (k of kinds; track k.kind) {
                      <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        (click)="addLine(k.kind)"
                      >
                        <i class="bi bi-plus-lg me-1"></i>{{ k.label }}
                      </button>
                    }
                  </div>
                  <div class="d-flex flex-wrap gap-2">
                    @if (editingId()) {
                      <button
                        type="button"
                        class="btn btn-outline-danger me-auto"
                        (click)="remove()"
                      >
                        Delete
                      </button>
                    }
                    <button type="submit" class="btn btn-primary ms-auto" [disabled]="saving()">
                      {{ editingId() ? 'Save changes' : 'Save scenario' }}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section class="card" aria-labelledby="scenario-preview" aria-live="polite">
              <div class="card-body">
                <h2 id="scenario-preview" class="h5">What it does</h2>
                @if (previewError(); as error) {
                  <p class="small text-danger-emphasis mb-0">{{ error }}</p>
                } @else if (preview(); as impact) {
                  <app-scenario-impact [impact]="impact" />
                } @else {
                  <p class="small text-body-secondary mb-0">
                    Add a what-if above — the answer appears here as you type.
                  </p>
                }
              </div>
            </section>
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class FinanceScenarios {
  private readonly financeService = inject(FinanceService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kinds = SCENARIO_KINDS;
  protected readonly kindLabels = SCENARIO_KIND_LABELS;
  protected readonly isMonthly = isMonthlyKind;
  protected readonly maxCompare = MAX_COMPARE;

  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly scenarios = signal<Scenario[]>([]);
  protected readonly impacts = signal<Record<number, ScenarioImpact>>({});
  protected readonly accounts = signal<Account[]>([]);
  protected readonly editingId = signal<number | null>(null);
  protected readonly compareIds = signal<number[]>([]);
  protected readonly preview = signal<ScenarioImpact | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly prefillNote = signal<string | null>(null);
  /** A wishlist price's currency, until the base currency is known to compare it with. */
  private prefillCurrency: string | null = null;
  /** Bumped whenever the form changes, so the computed error helpers re-read it. */
  private readonly formVersion = signal(0);

  protected readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control(''),
    notes: this.fb.control<string | null>(null),
    lines: this.fb.array<LineForm>([]),
  });

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.lines;
  }

  private readonly baseCurrency = computed(
    () =>
      this.preview()?.baseCurrency ??
      Object.values(this.impacts()).find((i) => i.baseCurrency)?.baseCurrency ??
      null,
  );

  /** Lines are in the base currency, so only accounts kept in it make sense. */
  protected readonly accountOptions = computed(() => {
    const base = this.baseCurrency();
    return this.accounts().filter((a) => !a.isArchived && (!base || a.currency === base));
  });

  protected readonly compared = computed(() =>
    this.compareIds()
      .map((id) => ({
        scenario: this.scenarios().find((s) => s.id === id),
        impact: this.impacts()[id],
      }))
      .filter(
        (c): c is { scenario: Scenario; impact: ScenarioImpact } => !!c.scenario && !!c.impact,
      ),
  );

  protected readonly comparedGoals = computed(() => {
    const seen = new Map<number, string>();
    for (const c of this.compared()) {
      for (const g of c.impact.goals) {
        seen.set(g.goalId, g.title);
      }
    }
    return [...seen].map(([goalId, title]) => ({ goalId, title }));
  });

  protected readonly nameError = computed(() => {
    this.formVersion();
    const control = this.form.controls.name;
    return (control.touched || this.submitted()) && !control.value.trim()
      ? 'Name the scenario so you can find it again.'
      : null;
  });

  protected readonly linesError = computed(() => {
    this.formVersion();
    return this.submitted() && this.lines.length === 0 ? 'Add at least one what-if.' : null;
  });

  constructor() {
    this.load();
    this.form.valueChanges
      .pipe(
        map(() => {
          this.formVersion.update((v) => v + 1);
          return this.validLines();
        }),
        debounceTime(400),
        switchMap((lines) => {
          if (!lines) {
            return of(null);
          }
          return this.financeService.previewScenario(lines).pipe(
            map((impact) => ({ impact, error: null as string | null })),
            catchError((err) =>
              of({ impact: null, error: apiErrorMessage(err, 'Could not work that out.') }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) {
          this.preview.set(result.impact);
          this.previewError.set(result.error);
          this.notePrefillCurrency(result.impact?.baseCurrency ?? null);
        } else if (this.lines.length === 0) {
          this.preview.set(null);
          this.previewError.set(null);
        }
      });

    const prefill = readAffordPrefill(this.route.snapshot.queryParamMap);
    if (prefill) {
      this.form.controls.name.setValue(`Buy ${prefill.name}`);
      this.addLine('Purchase', { title: prefill.name, amount: prefill.amount ?? undefined });
      if (prefill.currency) {
        this.prefillCurrency = prefill.currency;
      }
    }
  }

  protected load(): void {
    forkJoin({
      scenarios: this.financeService.scenarios(),
      accounts: this.financeService.accounts(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ scenarios, accounts }) => {
          this.scenarios.set(scenarios);
          this.accounts.set(accounts);
          this.loaded.set(true);
          this.loadFailed.set(false);
          this.loadImpacts(scenarios);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected money(amount: number, currency: string | null): string {
    return formatMoney(amount, currency ?? 'INR');
  }

  protected summary(s: Scenario): string {
    return s.lines
      .map((l) => l.title)
      .join(' · ')
      .slice(0, 140);
  }

  protected goalCell(impact: ScenarioImpact, goalId: number): string {
    const g = impact.goals.find((x) => x.goalId === goalId);
    return g ? `${monthsText(g.monthsAfter)} (${goalShiftText(g)})` : '—';
  }

  protected placeholderFor(kind: ScenarioLineKind): string {
    return SCENARIO_KINDS.find((k) => k.kind === kind)!.placeholder;
  }

  protected amountLabelFor(kind: ScenarioLineKind): string {
    return SCENARIO_KINDS.find((k) => k.kind === kind)!.amountLabel;
  }

  protected toggleCompare(id: number): void {
    this.compareIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-MAX_COMPARE),
    );
  }

  protected addLine(
    kind: ScenarioLineKind,
    values: Partial<Omit<ScenarioLine, 'kind'>> = {},
  ): void {
    this.lines.push(
      this.fb.group({
        kind: this.fb.nonNullable.control(kind),
        title: this.fb.nonNullable.control(values.title ?? ''),
        amount: this.fb.control<number | null>(values.amount ?? null),
        startsOn: this.fb.control<string | null>(values.startsOn ?? todayIso()),
        endsOn: this.fb.control<string | null>(values.endsOn ?? null),
        accountId: this.fb.control<number | null>(values.accountId ?? null),
        annualRate: this.fb.control<number | null>(values.annualRate ?? null),
        termMonths: this.fb.control<number | null>(values.termMonths ?? null),
      }),
    );
  }

  protected removeLine(index: number): void {
    this.lines.removeAt(index);
  }

  protected startNew(): void {
    this.editingId.set(null);
    this.submitted.set(false);
    this.prefillNote.set(null);
    this.lines.clear({ emitEvent: false });
    this.form.reset({ name: '', notes: null });
    if (this.route.snapshot.queryParamMap.keys.length) {
      void this.router.navigate([], { queryParams: {} });
    }
  }

  protected open(s: Scenario): void {
    this.editingId.set(s.id);
    this.submitted.set(false);
    this.prefillNote.set(null);
    this.lines.clear({ emitEvent: false });
    for (const l of s.lines) {
      this.addLine(l.kind, l);
    }
    this.form.reset(
      {
        name: s.name,
        notes: s.notes,
        lines: s.lines.map((l) => ({ ...l })),
      },
      { emitEvent: true },
    );
    this.preview.set(this.impacts()[s.id] ?? null);
  }

  protected lineError(index: number, field: LineField): string | null {
    this.formVersion();
    const line = this.lines.at(index);
    if (!line) {
      return null;
    }
    const control = line.controls[field];
    if (!control.touched && !this.submitted()) {
      return null;
    }
    return lineProblems(line)[field] ?? null;
  }

  protected save(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.formVersion.update((v) => v + 1);
    const lines = this.validLines();
    const name = this.form.controls.name.value.trim();
    if (!lines || !name) {
      return;
    }
    const payload = { name, notes: this.form.controls.notes.value?.trim() || null, lines };
    const id = this.editingId();
    this.saving.set(true);
    (id
      ? this.financeService.updateScenario(id, payload)
      : this.financeService.createScenario(payload)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.editingId.set(saved.id);
          this.scenarios.update((list) =>
            [...list.filter((s) => s.id !== saved.id), saved].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
          this.loadImpacts([saved]);
          this.toast.success(id ? 'Scenario saved.' : 'Scenario saved — rerun it any time.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the scenario.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const id = this.editingId();
    const scenario = this.scenarios().find((s) => s.id === id);
    if (!scenario) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${scenario.name}"?`,
      text: 'Only the what-if goes — nothing in your money changes.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.financeService.removeScenario(scenario.id).subscribe({
      next: () => {
        this.scenarios.update((list) => list.filter((s) => s.id !== scenario.id));
        this.compareIds.update((ids) => ids.filter((x) => x !== scenario.id));
        this.startNew();
        this.toast.success('Scenario deleted.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the scenario.')),
    });
  }

  private loadImpacts(scenarios: Scenario[]): void {
    for (const s of scenarios) {
      this.financeService
        .scenarioImpact(s.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (impact) => {
            this.impacts.update((all) => ({ ...all, [s.id]: impact }));
            this.notePrefillCurrency(impact.baseCurrency);
          },
          error: () => undefined,
        });
    }
    if (scenarios.length === 0 && this.prefillCurrency) {
      // Nothing saved yet: the preview's base currency answers the question instead.
      this.notePrefillCurrency(null);
    }
  }

  /** A wishlist price in another currency can't be used as it is — say so once the base currency is known. */
  private notePrefillCurrency(base: string | null): void {
    const currency = this.prefillCurrency;
    const known = base ?? this.preview()?.baseCurrency ?? null;
    if (currency && known && currency !== known) {
      this.prefillNote.set(
        `The price is in ${currency}; scenarios work in ${known}, so change the amount to what it would cost you in ${known}.`,
      );
      this.prefillCurrency = null;
    }
  }

  /** The lines as the API takes them, or null while any is incomplete (no preview, no save). */
  private validLines(): ScenarioLine[] | null {
    if (this.lines.length === 0) {
      return null;
    }
    const out: ScenarioLine[] = [];
    for (const line of this.lines.controls) {
      if (Object.keys(lineProblems(line)).length) {
        return null;
      }
      const v = line.getRawValue();
      const loan = v.kind === 'Loan';
      out.push({
        kind: v.kind,
        title: v.title.trim(),
        amount: v.amount!,
        startsOn: v.startsOn!,
        endsOn: isMonthlyKind(v.kind) ? v.endsOn : null,
        accountId: v.accountId,
        annualRate: loan ? v.annualRate : null,
        termMonths: loan ? v.termMonths : null,
      });
    }
    return out;
  }
}

/** What's wrong with a line, field by field — the same rules as `ScenarioMath.Check` on the server. */
function lineProblems(line: LineForm): Partial<Record<LineField, string>> {
  const v = line.getRawValue();
  const problems: Partial<Record<LineField, string>> = {};
  if (!v.title.trim()) {
    problems.title = 'Say what it is.';
  }
  if (v.amount === null || Number.isNaN(v.amount)) {
    problems.amount = 'Enter an amount.';
  } else if (v.kind === 'PayChange' ? v.amount === 0 : v.amount <= 0) {
    problems.amount =
      v.kind === 'PayChange' ? "Can't be zero (use − for a drop)." : 'More than zero.';
  }
  const startsError = dateFieldError(line.controls.startsOn.errors);
  if (startsError || !v.startsOn) {
    problems.startsOn = startsError ?? 'Pick a day.';
  } else if (v.startsOn < todayIso()) {
    problems.startsOn = 'Today or later.';
  }
  const endsError = dateFieldError(line.controls.endsOn.errors);
  if (isMonthlyKind(v.kind)) {
    if (endsError) {
      problems.endsOn = endsError;
    } else if (v.endsOn && v.startsOn && v.endsOn < v.startsOn) {
      problems.endsOn = "Can't end before it starts.";
    }
  }
  if (v.kind === 'Loan') {
    if (v.annualRate === null || v.annualRate < 0 || v.annualRate > 100) {
      problems.annualRate = '0 to 100.';
    }
    if (
      v.termMonths === null ||
      !Number.isInteger(v.termMonths) ||
      v.termMonths < 1 ||
      v.termMonths > 600
    ) {
      problems.termMonths = '1 to 600.';
    }
  }
  return problems;
}
