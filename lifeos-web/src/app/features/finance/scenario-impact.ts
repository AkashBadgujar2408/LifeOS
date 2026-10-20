import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { APP_DATE_FORMAT } from '../../core/dates/date-format';
import type { ScenarioImpact } from '../../core/services/finance.service';
import { formatMoney } from './finance-view';
import { affordVerdict, goalShiftText, monthsText, retirementShiftText } from './scenario-view';

/**
 * What a scenario does, before → after: the answer in a sentence, the lowest balance over the next 12 months (all
 * accounts, then each account a line moves), each savings goal's time to reach and the retirement age. Plain tables —
 * every figure is a comparison of two numbers, so a chart would add nothing.
 */
@Component({
  selector: 'app-scenario-impact',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @let i = impact();
    <p class="fw-semibold mb-3">{{ verdict() }}</p>
    @if (i.baseCurrency) {
      <h3 class="h6">Lowest balance by {{ i.until | date }}</h3>
      <div class="table-responsive">
        <table class="table table-sm small align-middle">
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col" class="text-end">Without</th>
              <th scope="col" class="text-end">With</th>
              <th scope="col" class="text-end">Change</th>
            </tr>
          </thead>
          <tbody>
            @for (low of i.lows; track low.accountId) {
              <tr>
                <th scope="row" class="fw-normal text-break">{{ low.name }}</th>
                <td class="text-end">
                  {{ money(low.before.balance) }}
                  <div class="text-body-secondary">{{ low.before.day | date }}</div>
                </td>
                <td class="text-end" [class.text-danger-emphasis]="low.after.balance < 0">
                  {{ money(low.after.balance) }}
                  <div class="text-body-secondary">{{ low.after.day | date }}</div>
                </td>
                <td class="text-end">{{ signed(low.after.balance - low.before.balance) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="small mb-3">
        Over the next 12 months this {{ i.nextTwelveMonths < 0 ? 'costs' : 'brings in' }}
        <strong>{{ money(abs(i.nextTwelveMonths)) }}</strong
        >.
      </p>

      @if (i.goals.length) {
        <h3 class="h6">Savings goals</h3>
        <ul class="list-unstyled small mb-3">
          @for (g of i.goals; track g.goalId) {
            <li class="d-flex flex-wrap justify-content-between gap-2 py-1 border-bottom">
              <span class="text-break">{{ g.title }}</span>
              <span>
                {{ months(g.monthsBefore) }} → <strong>{{ months(g.monthsAfter) }}</strong>
                <span class="text-body-secondary ms-1">({{ goalShift(g) }})</span>
              </span>
            </li>
          }
        </ul>
      }

      @if (i.retirement; as r) {
        <h3 class="h6">Retirement</h3>
        <p class="small mb-0">
          Enough by
          {{ r.ageBefore ?? 'not by 100' }} →
          <strong>{{ r.ageAfter ?? 'not by 100' }}</strong>
          <span class="text-body-secondary">
            ({{ retirementShift(r.ageBefore, r.ageAfter) }}) · projected at {{ r.retirementAge }}:
            {{ money(r.projectedBefore) }} → {{ money(r.projectedAfter) }}
          </span>
        </p>
      }
    }
  `,
})
export class ScenarioImpactView {
  private readonly locale = inject(LOCALE_ID);

  readonly impact = input.required<ScenarioImpact>();

  protected readonly verdict = computed(() =>
    affordVerdict(this.impact(), (iso) => formatDate(iso, APP_DATE_FORMAT, this.locale)),
  );
  protected readonly months = monthsText;
  protected readonly goalShift = goalShiftText;
  protected readonly retirementShift = retirementShiftText;
  protected readonly abs = Math.abs;

  protected money(amount: number): string {
    return formatMoney(amount, this.impact().baseCurrency ?? 'INR');
  }

  protected signed(amount: number): string {
    return amount === 0 ? '—' : (amount > 0 ? '+' : '−') + this.money(Math.abs(amount));
  }
}
