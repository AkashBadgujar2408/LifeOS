import type { KeepInTouch } from '../../core/services/family-log.service';
import { cadenceText, dueText, holderText, keepInTouchOrder, peopleText } from './family-log-view';

const person = (name: string, daysUntil: number): KeepInTouch => ({
  contactId: name.length,
  name,
  cadenceDays: 30,
  lastContactedOn: null,
  dueOn: '2026-10-21',
  daysUntil,
});

describe('family log view', () => {
  it('words where a keep-in-touch stands gently, like the API', () => {
    expect([0, 1, 6, -1, -12].map(dueText)).toEqual([
      'Due today',
      'Due tomorrow',
      'Due in 6 days',
      'A day past',
      '12 days past',
    ]);
  });

  it('puts the longest past due first, then the soonest due', () => {
    const order = keepInTouchOrder([
      person('Ravi', 12),
      person('Kiran', -30),
      person('Asha', -2),
      person('Meera', 12),
    ]);
    expect(order.map((p) => p.name)).toEqual(['Kiran', 'Asha', 'Meera', 'Ravi']);
  });

  it('names cadences and holders plainly', () => {
    expect(cadenceText(30)).toBe('Every month');
    expect(cadenceText(45)).toBe('Every 45 days');
    expect(holderText({ heldBy: 'Me', holderName: null })).toBe('You');
    expect(holderText({ heldBy: 'Shared', holderName: 'Ravi' })).toBe('Shared with Ravi');
    expect(holderText({ heldBy: 'Shared', holderName: null })).toBe('Shared');
    expect(holderText({ heldBy: 'Someone', holderName: 'Kiran' })).toBe('Kiran');
  });

  it('lists people without running on', () => {
    expect(peopleText(['Asha'])).toBe('Asha');
    expect(peopleText(['Asha', 'Ravi'])).toBe('Asha and Ravi');
    expect(peopleText(['Asha', 'Ravi', 'Kiran'])).toBe('Asha, Ravi and Kiran');
    expect(peopleText(['Asha', 'Ravi', 'Kiran', 'Meera', 'Dev'])).toBe('Asha, Ravi and 3 others');
  });
});
