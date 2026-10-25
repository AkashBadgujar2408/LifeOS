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
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { todayIso } from '../../core/dates/today';
import {
  LeisureService,
  YearInMedia as YearInMediaModel,
} from '../../core/services/leisure.service';
import { LoadError } from '../../shared/components/load-error/load-error';
import { formatMinutes } from '../calendar/calendar-feed';
import { MEDIA_KIND_INFO, stars } from './leisure-view';

/**
 * The year in media (Session 78b): what was finished, by kind; time logged; the best-rated; the genres. Bars are
 * plain HTML with their numbers beside them (one measure each, so no legend), scaled to the year's biggest kind.
 */
@Component({
  selector: 'app-year-in-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LoadError],
  template: `
    <div class="container py-4">
      <a routerLink="/leisure" class="small text-decoration-none d-inline-block mb-2">
        <i class="bi bi-arrow-left"></i> Leisure &amp; media
      </a>
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-4">
        <div>
          <h1 class="h3 mb-1">Your year in media</h1>
          @if (data(); as data) {
            <p class="text-body-secondary mb-0 small">{{ summary() }}</p>
          }
        </div>
        @if (data(); as data) {
          <div>
            <label class="visually-hidden" for="media-year">Year</label>
            <select
              id="media-year"
              class="form-select"
              style="width: auto"
              (change)="pick($any($event.target).value)"
            >
              @for (y of data.years; track y) {
                <option [value]="y" [selected]="y === data.year">{{ y }}</option>
              }
            </select>
          </div>
        }
      </div>

      @if (loadFailed() && !data()) {
        <app-load-error message="Couldn't load your year in media." (retry)="load()" />
      } @else if (data(); as data) {
        <div class="row g-3">
          <div class="col-lg-7">
            <section class="card h-100" aria-labelledby="year-kinds-heading">
              <div class="card-body">
                <h2 id="year-kinds-heading" class="h6 mb-3">Finished, by kind</h2>
                <table class="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Kind</th>
                      <th scope="col" class="w-50">Finished</th>
                      <th scope="col" class="text-end">Time logged</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of data.byKind; track row.kind) {
                      @if (row.finished > 0 || row.minutes > 0) {
                        <tr>
                          <th scope="row" class="fw-normal text-nowrap">
                            <i class="bi" [class]="kindInfo[row.kind].icon" aria-hidden="true"></i>
                            {{ kindInfo[row.kind].many }}
                          </th>
                          <td>
                            <div class="d-flex align-items-center gap-2">
                              <div
                                class="rounded-1"
                                style="height: 0.6rem; background: var(--lifeos-teal); min-width: 2px"
                                [style.width.%]="(row.finished * 80) / mostFinished()"
                                aria-hidden="true"
                              ></div>
                              <span class="small">{{ row.finished }}</span>
                            </div>
                          </td>
                          <td class="text-end small text-nowrap">
                            {{ row.minutes > 0 ? formatMinutes(row.minutes) : '—' }}
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
                @if (data.finished === 0 && data.minutes === 0) {
                  <p class="small text-body-secondary mb-0 mt-2">
                    Nothing finished or logged in {{ data.year }} yet.
                  </p>
                }
              </div>
            </section>
          </div>
          <div class="col-lg-5 d-flex flex-column gap-3">
            <section class="card" aria-labelledby="year-top-heading">
              <div class="card-body">
                <h2 id="year-top-heading" class="h6 mb-2">Best of the year</h2>
                <ol class="list-unstyled mb-0 d-flex flex-column gap-2">
                  @for (top of data.topRated; track top.id) {
                    <li>
                      <a [routerLink]="['/leisure', top.id]" class="fw-semibold text-break">{{
                        top.title
                      }}</a>
                      <div class="small text-body-secondary">
                        {{ kindInfo[top.kind].one }}
                        @if (top.creator) {
                          · {{ top.creator }}
                        }
                        ·
                        <span role="img" [attr.aria-label]="top.rating + ' of 5 stars'">{{
                          stars(top.rating)
                        }}</span>
                        · {{ top.finishedOn | date }}
                      </div>
                    </li>
                  } @empty {
                    <li class="small text-body-secondary">
                      Rate something four or five stars when you finish it and it shows here.
                    </li>
                  }
                </ol>
              </div>
            </section>
            @if (data.genres.length > 0) {
              <section class="card" aria-labelledby="year-genres-heading">
                <div class="card-body">
                  <h2 id="year-genres-heading" class="h6 mb-2">Genres</h2>
                  <div class="d-flex flex-wrap gap-1">
                    @for (genre of data.genres; track genre.name) {
                      <span class="badge text-bg-light border fw-normal"
                        >{{ genre.name }} · {{ genre.count }}</span
                      >
                    }
                  </div>
                </div>
              </section>
            }
          </div>
        </div>
      } @else {
        <p class="text-body-secondary">Loading...</p>
      }
    </div>
  `,
})
export class YearInMedia {
  private readonly leisureService = inject(LeisureService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** From the `:year` route parameter; this year when missing. */
  readonly year = input<string | undefined>();

  protected readonly kindInfo = MEDIA_KIND_INFO;
  protected readonly stars = stars;
  protected readonly formatMinutes = formatMinutes;
  protected readonly data = signal<YearInMediaModel | null>(null);
  protected readonly loadFailed = signal(false);

  protected readonly mostFinished = computed(() =>
    Math.max(1, ...(this.data()?.byKind.map((k) => k.finished) ?? [])),
  );
  protected readonly summary = computed(() => {
    const data = this.data();
    if (!data) {
      return '';
    }
    const finished = `${data.finished} finished`;
    return data.minutes > 0
      ? `${finished} in ${data.year}, ${formatMinutes(data.minutes)} logged.`
      : `${finished} in ${data.year}.`;
  });

  private readonly shownYear = computed(() => {
    const y = Number(this.year());
    return Number.isInteger(y) && y >= 1900 && y <= 2200 ? y : Number(todayIso().slice(0, 4));
  });

  constructor() {
    effect(() => {
      this.shownYear();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.leisureService
      .yearInMedia(this.shownYear())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loadFailed.set(false);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected pick(year: string): void {
    void this.router.navigate(['/leisure/year', year]);
  }
}
