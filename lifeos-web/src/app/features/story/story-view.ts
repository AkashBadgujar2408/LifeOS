import { localMidnight } from '../../core/dates/today';
import { MissionKind, StoryBeat, StorySection } from '../../core/services/story.service';

export const MISSION_LABELS: Record<MissionKind, string> = {
  Main: 'main mission',
  Side: 'side mission',
  Collectible: 'collectible',
};

/** How a beat reads in the story: an icon and a sentence, written in the second person like a biography's notes. */
export interface BeatText {
  icon: string;
  /** Tone class for the icon: a passed mission stands out, a let-go goal recedes. */
  tone: 'win' | 'step' | 'quiet' | 'hard';
  headline: string;
}

export function beatText(beat: StoryBeat): BeatText {
  const title = beat.title ?? '';
  const mission = beat.missionKind ? MISSION_LABELS[beat.missionKind] : 'goal';
  switch (beat.kind) {
    case 'GoalStarted':
      return { icon: 'bi-flag', tone: 'step', headline: `Set out on a ${mission}: ${title}` };
    case 'MissionPassed':
      return { icon: 'bi-trophy', tone: 'win', headline: `Mission passed: ${title}` };
    case 'MilestoneDone':
      return { icon: 'bi-check2-circle', tone: 'step', headline: `Objective done: ${title}` };
    case 'GoalPostponed':
      return { icon: 'bi-pause-circle', tone: 'quiet', headline: `Put ${title} on hold` };
    case 'GoalAbandoned':
      return { icon: 'bi-x-circle', tone: 'quiet', headline: `Let go of ${title}` };
    case 'GoalResumed':
      return { icon: 'bi-play-circle', tone: 'step', headline: `Picked ${title} back up` };
    case 'GoalRescheduled':
      return {
        icon: 'bi-calendar-event',
        tone: 'quiet',
        headline: `Moved the target for ${title}`,
      };
    case 'HabitStarted':
      return { icon: 'bi-arrow-repeat', tone: 'step', headline: `Started a habit: ${title}` };
    case 'AchievementUnlocked':
      return { icon: 'bi-award', tone: 'win', headline: `Achievement unlocked: ${title}` };
    case 'NewRole':
      return {
        icon: 'bi-briefcase',
        tone: 'step',
        headline: `Started as ${title} at ${beat.parentTitle ?? 'a new place'}`,
      };
    case 'CareerPromotion':
      return { icon: 'bi-arrow-up-circle', tone: 'win', headline: title };
    case 'CareerProject':
      // Achievement titles are written as sentences ("Shipped the payments rewrite"): the icon carries the kind.
      return { icon: 'bi-rocket-takeoff', tone: 'win', headline: title };
    case 'CareerAward':
      return { icon: 'bi-award', tone: 'win', headline: title };
    case 'CareerContribution':
      return { icon: 'bi-people', tone: 'step', headline: title };
    case 'CareerOther':
      return { icon: 'bi-star', tone: 'step', headline: title };
    case 'Memory':
      return {
        icon: 'bi-camera',
        tone: beat.mood === 1 ? 'hard' : beat.mood === 5 ? 'win' : 'step',
        headline: beat.title ? `A day to remember: ${title}` : 'A day to remember',
      };
    case 'JournalHighlight':
      return beat.mood === 1
        ? {
            icon: 'bi-cloud-rain',
            tone: 'hard',
            headline: beat.title ? `A hard day: ${title}` : 'A hard day',
          }
        : {
            icon: 'bi-sun',
            tone: 'win',
            headline: beat.title ? `A great day: ${title}` : 'A great day',
          };
  }
}

/** Where a beat's "open" link goes. */
export function beatLink(beat: StoryBeat): (string | number)[] | null {
  if (beat.kind === 'AchievementUnlocked') {
    return ['/achievements'];
  }
  if (beat.entityId === null) {
    return null;
  }
  switch (beat.entityType) {
    case 'Goal':
      return ['/goals', beat.entityId];
    case 'Habit':
      return ['/habits', beat.entityId];
    case 'JournalEntry':
      return ['/journal', beat.day];
    case 'Employment':
      return ['/career'];
    case 'CareerAchievement':
      return ['/career/achievements'];
    default:
      return null;
  }
}

/**
 * How long a chapter has run, in words: "3 years", "1 year, 2 months", "5 months", "12 days". An open chapter runs to
 * `today`. Whole calendar months, so 1 Jan – 31 Jan is "1 month" (end day inclusive).
 */
export function chapterLength(start: string, end: string | null, today: string): string {
  const last = end ?? today;
  const from = localMidnight(start);
  // Inclusive end: measure to the day after it.
  const to = localMidnight(last);
  to.setDate(to.getDate() + 1);

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) {
    months--;
  }
  if (months < 1) {
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    return days === 1 ? '1 day' : `${Math.max(days, 0)} days`;
  }

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? '1 year' : `${years} years`;
  const m = rest === 1 ? '1 month' : `${rest} months`;
  return years === 0 ? m : rest === 0 ? y : `${y}, ${m}`;
}

/** The heading for a stretch no chapter covers, from where it sits in the book. */
export function gapHeading(sections: readonly StorySection[], index: number): string {
  const hasChapterBefore = sections.slice(0, index).some((s) => s.chapter);
  const hasChapterAfter = sections.slice(index + 1).some((s) => s.chapter);
  if (!hasChapterBefore && !hasChapterAfter) {
    return 'Your story so far';
  }
  if (!hasChapterBefore) {
    return 'Before your first chapter';
  }
  return hasChapterAfter ? 'Between chapters' : 'Since your last chapter ended';
}
