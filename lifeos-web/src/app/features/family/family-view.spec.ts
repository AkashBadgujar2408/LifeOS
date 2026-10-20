import type { FamilyPerson, Relationship } from '../../core/services/family.service';
import {
  dayLabel,
  daysInMonth,
  generationHeading,
  relationshipFromView,
  relationshipPayload,
  treeGenerations,
  unplaced,
  whenText,
} from './family-view';

const edge = (overrides: Partial<Relationship>): Relationship => ({
  id: 1,
  personContactId: null,
  personName: null,
  relativeContactId: 5,
  relativeName: 'Asha',
  kind: 'Parent',
  label: null,
  ...overrides,
});

const person = (
  contactId: number,
  generation: number | null,
  relation: string | null,
): FamilyPerson => ({
  contactId,
  name: `P${contactId}`,
  phone: null,
  email: null,
  isFamily: true,
  relation,
  generation,
  nextBirthday: null,
  turnsAge: null,
  lastContactedOn: null,
});

describe('family view', () => {
  it('turns the form sentence into the API edge, children read the other way', () => {
    expect(relationshipPayload(5, 'Parent', null)).toEqual({
      personContactId: null,
      relativeContactId: 5,
      kind: 'Parent',
    });
    expect(relationshipPayload(9, 'Child', null)).toEqual({
      personContactId: 9,
      relativeContactId: null,
      kind: 'Parent',
    });
    expect(relationshipPayload(7, 'Sibling', 3)).toEqual({
      personContactId: 7,
      relativeContactId: 3,
      kind: 'Sibling',
    });
    expect(relationshipPayload(12, 'Other', null)).toEqual({
      personContactId: null,
      relativeContactId: 12,
      kind: 'Other',
    });
  });

  it('words a relationship from either side, preferring its label', () => {
    expect(relationshipFromView(edge({ label: 'Mother' }), 5)).toBe('Your mother');
    expect(relationshipFromView(edge({ personContactId: 9, personName: 'Arjun' }), 5)).toBe(
      'Parent of Arjun',
    );
    expect(relationshipFromView(edge({ personContactId: 9, personName: 'Arjun' }), 9)).toBe(
      'Child of Asha',
    );
    expect(
      relationshipFromView(
        edge({ personContactId: 9, relativeContactId: null, relativeName: null }),
        9,
      ),
    ).toBe('Your child');
    expect(
      relationshipFromView(edge({ personContactId: 3, personName: 'Ravi', kind: 'Partner' }), 3),
    ).toBe('Partner of Asha');
    expect(relationshipFromView(edge({ kind: 'Other', label: 'Godmother' }), 5)).toBe(
      'Your godmother',
    );
  });

  it('groups the tree by generation, oldest first, you always there', () => {
    const groups = treeGenerations([
      person(1, 1, "Parent's sibling"),
      person(2, 1, 'Parent'),
      person(3, -1, 'Child'),
      person(4, null, 'Godmother'),
    ]);

    expect(groups.map((g) => g.heading)).toEqual(['Parents', 'Your generation', 'Children']);
    expect(groups[0].people.map((p) => p.contactId)).toEqual([2, 1]);
    expect(groups[1].people).toEqual([]);
    expect(
      unplaced([person(4, null, 'Godmother'), person(2, 1, 'Parent')]).map((p) => p.contactId),
    ).toEqual([4]);
  });

  it('words days and generations plainly', () => {
    expect(dayLabel(3, 14, 1966)).toBe('14 Mar 1966');
    expect(dayLabel(2, 29, null)).toBe('29 Feb');
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(whenText(0)).toBe('Today');
    expect(whenText(1)).toBe('Tomorrow');
    expect(whenText(6)).toBe('In 6 days');
    expect(generationHeading(2)).toBe('Grandparents');
    expect(generationHeading(-2)).toBe('Grandchildren');
    expect(generationHeading(5)).toBe('5 generations up');
  });
});
