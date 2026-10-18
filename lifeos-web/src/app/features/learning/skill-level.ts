import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Proficiency } from '../../core/services/learning.service';
import { PROFICIENCY_LABELS, PROFICIENCY_LEVELS } from './learning-view';

/**
 * A skill's level as five segments: filled up to where you are, the target segment outlined. The words go to
 * assistive tech (and the title), so the picture is never the only way to read it.
 */
@Component({
  selector: 'app-skill-level',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="d-inline-flex gap-1 align-items-center"
      role="img"
      [attr.aria-label]="label()"
      [title]="label()"
    >
      @for (level of levels; track level) {
        <span
          class="skill-segment"
          [class.skill-segment-on]="level <= proficiency()"
          [class.skill-segment-target]="level === target() && level > proficiency()"
        ></span>
      }
    </span>
  `,
  styles: `
    .skill-segment {
      width: 1.1rem;
      height: 0.45rem;
      border-radius: 2px;
      background: var(--lifeos-border);
    }
    .skill-segment-on {
      background: var(--lifeos-teal);
    }
    .skill-segment-target {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--lifeos-teal);
    }
  `,
})
export class SkillLevel {
  readonly proficiency = input.required<Proficiency>();
  readonly target = input<Proficiency | null>(null);

  protected readonly levels = PROFICIENCY_LEVELS;
  protected readonly label = computed(() => {
    const level = this.proficiency();
    const now = `Level ${level} of 5, ${PROFICIENCY_LABELS[level].toLowerCase()}`;
    const target = this.target();
    return target && target > level ? `${now}; aiming for ${target}` : now;
  });
}
