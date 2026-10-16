import { Reminder } from '../../core/services/reminders.service';
import { defaultRemindAt, snoozePresets, splitPending } from './reminder-times';

// Local-time constructors throughout, so these hold in whatever timezone the tests run in.

const reminder = (id: number, remindAt: Date): Reminder => ({
  id,
  title: `Reminder ${id}`,
  notes: null,
  remindAt: remindAt.toISOString(),
  dismissedAt: null,
  entityType: null,
  entityId: null,
  entityTitle: null,
  recurrence: null,
  timeZone: null,
  occurrenceDate: null,
  createdAt: remindAt.toISOString(),
});

describe('snoozePresets', () => {
  it('offers an hour, this evening and tomorrow morning during the day', () => {
    const now = new Date(2026, 9, 15, 10, 20);
    expect(snoozePresets(now)).toEqual([
      { label: 'In 1 hour', until: new Date(2026, 9, 15, 11, 20).toISOString() },
      { label: 'This evening (18:00)', until: new Date(2026, 9, 15, 18, 0).toISOString() },
      { label: 'Tomorrow morning (09:00)', until: new Date(2026, 9, 16, 9, 0).toISOString() },
    ]);
  });

  it('drops "this evening" once 18:00 is less than an hour away', () => {
    const labels = snoozePresets(new Date(2026, 9, 15, 17, 10)).map((p) => p.label);
    expect(labels).toEqual(['In 1 hour', 'Tomorrow morning (09:00)']);
  });

  it('rolls "tomorrow" over a month end', () => {
    const presets = snoozePresets(new Date(2026, 9, 31, 22, 0));
    expect(presets.at(-1)!.until).toBe(new Date(2026, 10, 1, 9, 0).toISOString());
  });
});

describe('splitPending', () => {
  it('puts reminders whose moment has come (inclusive) in due, keeping order', () => {
    const now = new Date(2026, 9, 15, 12, 0);
    const earlier = reminder(1, new Date(2026, 9, 15, 9, 0));
    const exactlyNow = reminder(2, now);
    const later = reminder(3, new Date(2026, 9, 15, 12, 1));

    expect(splitPending([earlier, exactlyNow, later], now)).toEqual({
      due: [earlier, exactlyNow],
      upcoming: [later],
    });
  });
});

describe('defaultRemindAt', () => {
  it('picks the next whole hour', () => {
    expect(defaultRemindAt(new Date(2026, 9, 15, 10, 20))).toEqual(new Date(2026, 9, 15, 11, 0));
  });

  it('skips an hour that is under 30 minutes away', () => {
    expect(defaultRemindAt(new Date(2026, 9, 15, 10, 45))).toEqual(new Date(2026, 9, 15, 12, 0));
  });

  it('crosses midnight', () => {
    expect(defaultRemindAt(new Date(2026, 9, 15, 23, 50))).toEqual(new Date(2026, 9, 16, 1, 0));
  });
});
