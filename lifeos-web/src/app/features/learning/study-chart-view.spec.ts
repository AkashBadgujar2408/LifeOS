import { assignSlots, subjectKey, toHours } from './study-chart-view';

describe('subjectKey', () => {
  it('identifies items by id and topics by their words', () => {
    expect(subjectKey({ kind: 'Skill', id: 3, name: 'Spanish' })).toBe('Skill:3');
    expect(subjectKey({ kind: 'Topic', id: null, name: 'Subjunctive' })).toBe('Topic:subjunctive');
    expect(subjectKey({ kind: 'Other', id: null, name: 'Everything else' })).toBe('Other');
  });
});

describe('assignSlots', () => {
  it('hands out slots in order the first time', () => {
    const slots = assignSlots(new Map(), ['Skill:1', 'Skill:2', 'Other']);
    expect([...slots]).toEqual([
      ['Skill:1', 0],
      ['Skill:2', 1],
    ]);
  });

  it('keeps a colour with its subject when the order changes', () => {
    const first = assignSlots(new Map(), ['Skill:1', 'Skill:2', 'Course:5']);
    const next = assignSlots(first, ['Course:5', 'Topic:x', 'Skill:1']);
    expect(next.get('Course:5')).toBe(2);
    expect(next.get('Skill:1')).toBe(0);
    // Skill:2 left, so its slot is the lowest free one.
    expect(next.get('Topic:x')).toBe(1);
  });

  it('never hands out more slots than there are colours', () => {
    const slots = assignSlots(new Map(), ['a', 'b', 'c'], 2);
    expect(slots.size).toBe(2);
    expect(slots.has('c')).toBe(false);
  });
});

describe('toHours', () => {
  it('rounds to a tenth of an hour', () => {
    expect(toHours(90)).toBe(1.5);
    expect(toHours(20)).toBe(0.3);
    expect(toHours(0)).toBe(0);
  });
});
