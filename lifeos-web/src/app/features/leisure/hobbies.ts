import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { todayIso } from '../../core/dates/today';
import { Hobby, HobbyMonth, LeisureService } from '../../core/services/leisure.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { openHobbyEditor } from './hobby-editor';

const MONTHS = 6;

/**
 * Hobbies (Session 78b): each one with its time so far, and a month-by-month table of the last six months — every
 * cell carries its value and a bar scaled to the busiest month, so it reads without colour.
 */
@Component({
  selector: 'app-hobbies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <a routerLink="/leisure" class="small text-decoration-none d-inline-block mb-2">
        <i class="bi bi-arrow-left"></i> Leisure &amp; media
      </a>
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Hobbies</h1>
          <p class="text-body-secondary mb-0 small">
            The things you do for their own sake, and the time you give them.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="add()">
          <i class="bi bi-plus-lg"></i> Add a hobby
        </button>
      </div>

      @if (loadFailed() && !hobbies()) {
        <app-load-error message="Couldn't load your hobbies." (retry)="load()" />
      } @else if (hobbies(); as hobbies) {
        @if (hobbies.length === 0) {
          <section class="card">
            <div class="card-body p-4">
              <h2 class="h5">No hobbies yet</h2>
              <p class="text-body-secondary">
                Add the guitar in the corner or the sketchbook you keep meaning to open. A practice
                timer logs the time for you.
              </p>
              <button type="button" class="btn btn-outline-primary" (click)="add()">
                <i class="bi bi-plus-lg"></i> Add a hobby
              </button>
            </div>
          </section>
        } @else {
          <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3 mb-4">
            @for (hobby of hobbies; track hobby.id) {
              <div class="col">
                <div class="card h-100" [class.opacity-75]="hobby.status === 'Archived'">
                  <div class="card-body d-flex flex-column gap-1">
                    <a
                      [routerLink]="['/leisure/hobbies', hobby.id]"
                      class="stretched-link link-body-emphasis text-decoration-none fw-semibold text-break"
                      >{{ hobby.name }}</a
                    >
                    @if (hobby.status === 'Archived') {
                      <div class="small text-body-secondary">Archived</div>
                    }
                    <div class="small text-body-secondary mt-auto pt-1">
                      @if (hobby.totalMinutes > 0) {
                        {{ formatMinutes(hobby.totalMinutes) }} in all
                        @if (thisMonth().get(hobby.id); as minutes) {
                          · {{ formatMinutes(minutes) }} this month
                        }
                        @if (hobby.lastPracticedOn) {
                          · last {{ hobby.lastPracticedOn | date }}
                        }
                      } @else {
                        No time logged yet
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>

          @if (months().length > 0 && busiest() > 0) {
            <section class="card" aria-labelledby="hobby-time-heading">
              <div class="card-body">
                <h2 id="hobby-time-heading" class="h6 mb-1">Time per month</h2>
                <p class="small text-body-secondary mb-3">{{ summary() }}</p>
                <div class="table-responsive">
                  <table class="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Hobby</th>
                        @for (month of months(); track month.month) {
                          <th scope="col" class="text-end text-nowrap">
                            {{ month.month | date: 'MMM' }}
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (hobby of practised(); track hobby.id) {
                        <tr>
                          <th scope="row" class="fw-normal text-break">{{ hobby.name }}</th>
                          @for (month of months(); track month.month) {
                            <td class="text-end" style="min-width: 4.5rem">
                              @if (minutesIn(month, hobby.id); as minutes) {
                                <div class="small text-nowrap">{{ formatMinutes(minutes) }}</div>
                                <div
                                  class="ms-auto rounded-1"
                                  style="height: 0.35rem; background: var(--lifeos-teal)"
                                  [style.width.%]="(minutes * 100) / busiest()"
                                  aria-hidden="true"
                                ></div>
                              } @else {
                                <span class="small text-body-secondary">—</span>
                              }
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          }
        }
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class Hobbies {
  private readonly leisureService = inject(LeisureService);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatMinutes = formatMinutes;
  protected readonly hobbies = signal<Hobby[] | null>(null);
  protected readonly months = signal<HobbyMonth[]>([]);
  protected readonly loadFailed = signal(false);

  /** Hobbies with any time in the window, in the list's order. */
  protected readonly practised = computed(() => {
    const ids = new Set(this.months().flatMap((m) => m.hobbies.map((h) => h.hobbyId)));
    return (this.hobbies() ?? []).filter((h) => ids.has(h.id));
  });
  protected readonly busiest = computed(() =>
    Math.max(0, ...this.months().flatMap((m) => m.hobbies.map((h) => h.minutes))),
  );
  protected readonly thisMonth = computed(() => {
    const last = this.months().at(-1);
    return new Map(last?.hobbies.map((h) => [h.hobbyId, h.minutes]) ?? []);
  });
  protected readonly summary = computed(() => {
    const total = this.months().reduce(
      (sum, m) => sum + m.hobbies.reduce((s, h) => s + h.minutes, 0),
      0,
    );
    const top = this.practised()
      .map((h) => ({
        name: h.name,
        minutes: this.months().reduce((s, m) => s + this.minutesIn(m, h.id), 0),
      }))
      .sort((a, b) => b.minutes - a.minutes)[0];
    return top
      ? `${formatMinutes(total)} over the last ${MONTHS} months, most of it on ${top.name} (${formatMinutes(top.minutes)}).`
      : '';
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    forkJoin([this.leisureService.hobbies(), this.leisureService.hobbyTime(todayIso(), MONTHS)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([hobbies, months]) => {
          this.hobbies.set(hobbies);
          this.months.set(months);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected minutesIn(month: HobbyMonth, hobbyId: number): number {
    return month.hobbies.find((h) => h.hobbyId === hobbyId)?.minutes ?? 0;
  }

  protected async add(): Promise<void> {
    const saved = await openHobbyEditor(this.modal);
    if (saved) {
      this.toast.success(`${saved.name} added.`);
      void this.router.navigate(['/leisure/hobbies', saved.id]);
    }
  }
}
