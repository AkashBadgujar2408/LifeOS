import { StoryRecap } from '../../core/services/story.service';
import { MISSION_KIND_META, nextObjective } from './missions-view';
import { beatText } from './story-view';

/**
 * What the narrator gets for "Previously on…" (Session 96): the recap card's own words, one line per thing it shows —
 * the chapter, each recent beat with its day, the mission up next with its progress as the bar shows it. `day`
 * formats a date the way the card does.
 */
export function recapLines(
  recap: StoryRecap,
  day: (iso: string) => string,
  dayMonth: (iso: string) => string,
): string[] {
  const lines: string[] = [];
  if (recap.chapter) {
    lines.push(
      `Current chapter ${recap.chapterNumber}: ${recap.chapter.title} (since ${day(recap.chapter.startDate)})`,
    );
  }
  for (const beat of recap.recentBeats) {
    lines.push(`Lately, ${dayMonth(beat.day)}: ${beatText(beat).headline}`);
  }
  const mission = recap.currentMission;
  if (mission) {
    let line = `Up next, ${MISSION_KIND_META[mission.kind].label}: ${mission.title}`;
    if (mission.targetDate) {
      line += `, by ${day(mission.targetDate)}`;
    }
    if (
      !mission.progressLocked &&
      (mission.objectives.length > 0 || mission.progressKind !== 'Milestones')
    ) {
      line += `, ${mission.progressPercent}% of the way`;
      const next = nextObjective(mission);
      if (next) {
        line += `; next: ${next}`;
      }
    }
    lines.push(line);
  }
  return lines;
}
