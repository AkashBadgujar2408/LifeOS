import type {
  GiftStatus,
  InteractionKind,
  KeepInTouch,
  Responsibility,
  ResponsibilityHolder,
} from '../../core/services/family-log.service';

/**
 * Showing Family's log (Session 74): interactions, keep in touch, gifts, responsibilities. Figures (when someone is
 * due) come from the API; these only word and order them. Gentle by design — past due is a nudge, never a score.
 */

export const INTERACTION_KINDS: readonly { value: InteractionKind; label: string; icon: string }[] =
  [
    { value: 'Call', label: 'Call', icon: 'bi-telephone' },
    { value: 'Video', label: 'Video call', icon: 'bi-camera-video' },
    { value: 'Message', label: 'Message', icon: 'bi-chat-dots' },
    { value: 'Meeting', label: 'Met up', icon: 'bi-cup-hot' },
    { value: 'Visit', label: 'Visit', icon: 'bi-house-heart' },
    { value: 'Event', label: 'Occasion', icon: 'bi-balloon' },
    { value: 'Other', label: 'Other', icon: 'bi-three-dots' },
  ];

export function interactionKind(kind: InteractionKind): { label: string; icon: string } {
  return INTERACTION_KINDS.find((k) => k.value === kind) ?? { label: kind, icon: 'bi-dot' };
}

/** Choices for "keep in touch every …"; anything else is typed as a number of days. */
export const CADENCE_CHOICES: readonly { days: number; label: string }[] = [
  { days: 7, label: 'Every week' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Every month' },
  { days: 90, label: 'Every 3 months' },
  { days: 182, label: 'Every 6 months' },
  { days: 365, label: 'Every year' },
];

/** "Every month", or "Every 45 days" for a cadence that isn't one of the choices. */
export function cadenceText(days: number): string {
  return CADENCE_CHOICES.find((c) => c.days === days)?.label ?? `Every ${days} days`;
}

/** "Due in 3 days", "Due today", "4 days past" — same words as the API's KeepInTouchRules.Describe. */
export function dueText(daysUntil: number): string {
  if (daysUntil === 0) {
    return 'Due today';
  }
  if (daysUntil === 1) {
    return 'Due tomorrow';
  }
  if (daysUntil > 1) {
    return `Due in ${daysUntil} days`;
  }
  return daysUntil === -1 ? 'A day past' : `${-daysUntil} days past`;
}

/** Past due first (the longest first), then the soonest due; A–Z among equals. */
export function keepInTouchOrder(items: readonly KeepInTouch[]): KeepInTouch[] {
  return [...items].sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}

export const GIFT_STATUSES: readonly { value: GiftStatus; label: string; icon: string }[] = [
  { value: 'Idea', label: 'Idea', icon: 'bi-lightbulb' },
  { value: 'Bought', label: 'Bought', icon: 'bi-bag-check' },
  { value: 'Given', label: 'Given', icon: 'bi-gift' },
];

export function giftStatus(status: GiftStatus): { label: string; icon: string } {
  return GIFT_STATUSES.find((s) => s.value === status) ?? { label: status, icon: 'bi-gift' };
}

export const HOLDERS: readonly { value: ResponsibilityHolder; label: string; hint: string }[] = [
  { value: 'Me', label: 'Me', hint: 'Yours to look after.' },
  {
    value: 'Shared',
    label: 'Shared',
    hint: 'You share it — name the other person if it is one person.',
  },
  { value: 'Someone', label: 'Someone else', hint: 'Someone else looks after it; you keep track.' },
];

/** "You", "Shared with Ravi", "Shared", "Ravi". */
export function holderText(r: Pick<Responsibility, 'heldBy' | 'holderName'>): string {
  switch (r.heldBy) {
    case 'Me':
      return 'You';
    case 'Shared':
      return r.holderName ? `Shared with ${r.holderName}` : 'Shared';
    default:
      return r.holderName ?? 'Someone else';
  }
}

/** "Asha, Ravi and 2 others" — the people an interaction was with, minus the one whose page it's on. */
export function peopleText(names: readonly string[], max = 3): string {
  if (names.length <= max) {
    return names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const rest = names.length - (max - 1);
  return `${names.slice(0, max - 1).join(', ')} and ${rest} others`;
}
