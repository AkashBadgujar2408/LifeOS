import type {
  FamilyPerson,
  Relationship,
  RelationshipKind,
  SignificantDateKind,
} from '../../core/services/family.service';

/**
 * Showing the family (Session 73). Where people sit, ages and next days are always the API's (FamilyTree,
 * SignificantDays) — these helpers only word and group what it sent. Nothing here rates a person.
 */

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** The longest a month can be (29 for February — a leap day is allowed without a year). */
export function daysInMonth(month: number): number {
  return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "14 Mar 1966", or "14 Mar" when the year isn't known. */
export function dayLabel(month: number, day: number, year: number | null): string {
  return `${day} ${MONTHS[month - 1]}${year ? ` ${year}` : ''}`;
}

/** "Today", "Tomorrow", "In 5 days". */
export function whenText(daysUntil: number): string {
  if (daysUntil <= 0) {
    return 'Today';
  }
  return daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
}

export const DATE_KIND_LABELS: Record<SignificantDateKind, string> = {
  Birthday: 'Birthday',
  Anniversary: 'Anniversary',
  Other: 'Another day',
};

export const DATE_KIND_ICONS: Record<SignificantDateKind, string> = {
  Birthday: 'bi-cake2',
  Anniversary: 'bi-heart',
  Other: 'bi-calendar-heart',
};

/** How the relationship form asks: "They are the … of …". `Child` is a Parent edge read the other way. */
export type RelationChoice = 'Parent' | 'Child' | 'Partner' | 'Sibling' | 'Other';

export const RELATION_CHOICES: readonly { value: RelationChoice; label: string }[] = [
  { value: 'Parent', label: 'parent' },
  { value: 'Child', label: 'child' },
  { value: 'Partner', label: 'partner' },
  { value: 'Sibling', label: 'sibling' },
  { value: 'Other', label: 'something else…' },
];

/**
 * "<this person> is the <choice> of <other>" → the API's edge (relative is person's kind; null = you).
 * `other` null is you.
 */
export function relationshipPayload(
  contactId: number,
  choice: RelationChoice,
  other: number | null,
): { personContactId: number | null; relativeContactId: number | null; kind: RelationshipKind } {
  switch (choice) {
    case 'Parent':
      return { personContactId: other, relativeContactId: contactId, kind: 'Parent' };
    case 'Child':
      return { personContactId: contactId, relativeContactId: other, kind: 'Parent' };
    case 'Other':
      return { personContactId: other, relativeContactId: contactId, kind: 'Other' };
    default:
      return { personContactId: contactId, relativeContactId: other, kind: choice };
  }
}

const KIND_WORDS: Record<RelationshipKind, string> = {
  Parent: 'parent',
  Partner: 'partner',
  Sibling: 'sibling',
  Other: 'relative',
};

/**
 * One relationship as seen from a person's page: "Your parent", "Parent of Arjun", "Your child", "Child of Asha",
 * "Partner of Ravi", "Godmother of Kiran". The label ("Mother", "Wife") is used when there is one.
 */
export function relationshipFromView(r: Relationship, contactId: number): string {
  const word = r.label ?? KIND_WORDS[r.kind];
  if (r.relativeContactId === contactId) {
    // This person is the other side's `word`.
    return r.personContactId === null ? `Your ${lower(word)}` : `${upper(word)} of ${r.personName}`;
  }
  if (r.kind === 'Parent') {
    // The other side is this person's parent: this person is their child.
    return r.relativeContactId === null ? 'Your child' : `Child of ${r.relativeName}`;
  }
  if (r.kind === 'Other') {
    return `${r.relativeName ?? 'You'}: their ${lower(word)}`;
  }
  return `${upper(word)} of ${r.relativeName ?? 'you'}`;
}

/** The relationships a person is in (either side). */
export function relationshipsOf(all: readonly Relationship[], contactId: number): Relationship[] {
  return all.filter((r) => r.personContactId === contactId || r.relativeContactId === contactId);
}

/** "Grandparents", "Parents", "Your generation", "Children", "Great-grandchildren", "4 generations up". */
export function generationHeading(generation: number): string {
  const words: Record<number, string> = {
    3: 'Great-grandparents',
    2: 'Grandparents',
    1: 'Parents',
    0: 'Your generation',
    [-1]: 'Children',
    [-2]: 'Grandchildren',
    [-3]: 'Great-grandchildren',
  };
  return (
    words[generation] ?? `${Math.abs(generation)} generations ${generation > 0 ? 'up' : 'down'}`
  );
}

export interface TreeGeneration {
  generation: number;
  heading: string;
  people: FamilyPerson[];
}

/**
 * The tree as nested lists: one group per generation, oldest first, each person under their generation (closest
 * relations first — "Parent" before "Parent's sibling" — then A–Z). Your generation always shows, since you're in it.
 */
export function treeGenerations(people: readonly FamilyPerson[]): TreeGeneration[] {
  const placed = people.filter((p) => p.generation !== null);
  const generations = [...new Set([0, ...placed.map((p) => p.generation!)])].sort((a, b) => b - a);
  return generations.map((generation) => ({
    generation,
    heading: generationHeading(generation),
    people: placed
      .filter((p) => p.generation === generation)
      .sort(
        (a, b) =>
          (a.relation ?? '').split("'s").length - (b.relation ?? '').split("'s").length ||
          a.name.localeCompare(b.name),
      ),
  }));
}

/** Family the tree can't place: an "Other" relation to you, or not connected to you at all. */
export function unplaced(people: readonly FamilyPerson[]): FamilyPerson[] {
  return people.filter((p) => p.isFamily && p.generation === null);
}

function upper(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
