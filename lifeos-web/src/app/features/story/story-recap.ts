import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { APP_DAY_MONTH_FORMAT } from '../../core/dates/date-format';
import { StoryService } from '../../core/services/story.service';
import { MISSION_KIND_META, nextObjective } from './missions-view';
import { beatLink, beatText } from './story-view';

/**
 * "Previously on…": the TV-style recap on My Day — the chapter you're in, the last few things that happened, and the
 * mission to keep going with. Fetches itself (api/Story/LifeStory/recap) and invites you to start the story when
 * there's nothing to recap yet.
 */
@Component({
  selector: 'app-story-recap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h2 id="recap-heading" class="h5 mb-0 recap-title">Previously on your story</h2>
      <a routerLink="/story" class="small">Read your story</a>
    </div>
    @if (recap.value(); as r) {
      @if (!r.chapter && r.recentBeats.length === 0 && !r.currentMission) {
        <p class="text-body-secondary mb-0">
          Nothing to recap yet. <a routerLink="/story">Name the chapter you're in</a> and set a goal
          — your story starts there.
        </p>
      } @else {
        <div class="row g-4">
          <div class="col-md-4">
            <div class="recap-label">Chapter</div>
            @if (r.chapter; as chapter) {
              <div class="fw-semibold text-break">{{ r.chapterNumber }}. {{ chapter.title }}</div>
              <div class="small text-body-secondary">since {{ chapter.startDate | date }}</div>
            } @else {
              <div class="small text-body-secondary">
                No current chapter. <a routerLink="/story">Name it</a>
              </div>
            }
          </div>

          <div class="col-md-4">
            <div class="recap-label">Lately</div>
            @if (r.recentBeats.length === 0) {
              <div class="small text-body-secondary">Nothing recorded yet.</div>
            } @else {
              <ul class="list-unstyled mb-0 d-flex flex-column gap-1">
                @for (beat of r.recentBeats; track $index) {
                  @let text = beatText(beat);
                  @let link = beatLink(beat);
                  <li class="d-flex gap-2 small">
                    <i class="bi {{ text.icon }} recap-icon recap-tone-{{ text.tone }}"></i>
                    <span class="min-w-0">
                      @if (link) {
                        <a [routerLink]="link" class="link-body-emphasis text-break">{{
                          text.headline
                        }}</a>
                      } @else {
                        <span class="text-break">{{ text.headline }}</span>
                      }
                      <span class="text-body-secondary">
                        · {{ beat.day | date: dayMonthFormat }}</span
                      >
                    </span>
                  </li>
                }
              </ul>
            }
          </div>

          <div class="col-md-4">
            <div class="recap-label">Up next</div>
            @if (r.currentMission; as mission) {
              <a
                [routerLink]="['/goals', mission.id]"
                class="d-block fw-semibold link-body-emphasis text-decoration-none text-break"
              >
                <i class="bi {{ kindMeta[mission.kind].icon }} recap-tone-step"></i>
                {{ mission.title }}
              </a>
              <div class="small text-body-secondary">
                {{ kindMeta[mission.kind].label }}
                @if (mission.targetDate) {
                  · by {{ mission.targetDate | date }}
                }
              </div>
              @if (mission.objectives.length > 0) {
                <div
                  class="progress mt-2"
                  style="height: 0.4rem"
                  role="progressbar"
                  [attr.aria-label]="mission.title + ' progress'"
                  [attr.aria-valuenow]="mission.progressPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div class="progress-bar" [style.width.%]="mission.progressPercent"></div>
                </div>
                @if (nextObjective(mission); as next) {
                  <div class="small text-body-secondary mt-1 text-truncate">Next: {{ next }}</div>
                }
              }
            } @else {
              <div class="small text-body-secondary">
                No mission in play. <a routerLink="/goals">Set a goal</a>
              </div>
            }
          </div>
        </div>
      }
    } @else if (recap.error()) {
      <p class="text-body-secondary mb-0">Couldn't load the recap.</p>
    } @else {
      <p class="text-body-secondary mb-0">Catching up...</p>
    }
  `,
  styles: `
    .recap-title {
      font-family: 'Sora', sans-serif;
    }
    .recap-label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--cui-secondary-color);
      margin-bottom: 0.35rem;
    }
    .recap-icon {
      flex-shrink: 0;
    }
    .recap-tone-win,
    .recap-tone-step {
      color: var(--lifeos-teal);
    }
    .recap-tone-quiet {
      color: var(--cui-secondary-color);
    }
    .recap-tone-hard {
      color: var(--lifeos-amber);
    }
  `,
})
export class StoryRecap {
  private readonly storyService = inject(StoryService);

  protected readonly beatText = beatText;
  protected readonly beatLink = beatLink;
  protected readonly nextObjective = nextObjective;
  protected readonly kindMeta = MISSION_KIND_META;
  protected readonly dayMonthFormat = APP_DAY_MONTH_FORMAT;

  protected readonly recap = rxResource({ stream: () => this.storyService.recap() });
}
