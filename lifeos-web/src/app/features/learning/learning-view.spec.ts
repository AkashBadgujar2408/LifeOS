import type { SkillLevelChange } from '../../core/services/learning.service';
import { groupByStatus, levelChangeText, targetText } from './learning-view';

describe('groupByStatus', () => {
  it('keeps the given order and drops empty groups', () => {
    const items = [
      { id: 1, status: 'Finished' as const },
      { id: 2, status: 'Reading' as const },
      { id: 3, status: 'Reading' as const },
    ];
    const groups = groupByStatus(items, ['Reading', 'WantToRead', 'Finished'] as const);
    expect(groups.map((g) => [g.status, g.items.map((i) => i.id)])).toEqual([
      ['Reading', [2, 3]],
      ['Finished', [1]],
    ]);
  });
});

describe('targetText', () => {
  it('counts the levels left to the target', () => {
    expect(targetText({ proficiency: 2, targetProficiency: 4 })).toBe('2 levels to go');
    expect(targetText({ proficiency: 3, targetProficiency: 4 })).toBe('1 level to go');
    expect(targetText({ proficiency: 5, targetProficiency: 4 })).toBe('At your target');
    expect(targetText({ proficiency: 2, targetProficiency: null })).toBeNull();
  });
});

describe('levelChangeText', () => {
  const change = (
    from: SkillLevelChange['fromProficiency'],
    to: SkillLevelChange['toProficiency'],
  ) => ({
    id: 1,
    fromProficiency: from,
    toProficiency: to,
    changedOn: '2026-10-18',
    note: null,
  });

  it('says where it started and which way it moved', () => {
    expect(levelChangeText(change(null, 2))).toBe('Started at Getting the basics');
    expect(levelChangeText(change(2, 3))).toBe('Up to Comfortable');
    expect(levelChangeText(change(3, 1))).toBe('Down to Just starting');
  });
});
