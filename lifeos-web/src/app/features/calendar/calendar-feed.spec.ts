import { CalendarFeedItem } from '../../core/services/calendar.service';
import { feedRange, localDateTimeToUtc, toEventInput, utcToLocalParts } from './calendar-feed';

// Local-time constructors throughout, so these hold in whatever timezone the tests run in.

const item = (overrides: Partial<CalendarFeedItem>): CalendarFeedItem => ({
  sourceType: 'Event',
  sourceId: 1,
  title: 'Item',
  isAllDay: true,
  startDate: '2026-10-18',
  endDate: '2026-10-18',
  startsAt: null,
  endsAt: null,
  isDone: false,
  priority: null,
  parentId: null,
  parentTitle: null,
  location: null,
  isRecurring: false,
  occurrenceDate: null,
  ...overrides,
});

describe('feedRange', () => {
  it('turns the visible span into inclusive local days plus UTC instants', () => {
    const start = new Date(2026, 8, 28); // Mon 28 Sep, first cell of the October month view
    const end = new Date(2026, 10, 9); // exclusive: local midnight after Sun 8 Nov

    expect(feedRange(start, end)).toEqual({
      from: '2026-09-28',
      to: '2026-11-08',
      fromUtc: start.toISOString(),
      toUtc: end.toISOString(),
    });
  });

  it('handles a week ending at a year boundary', () => {
    expect(feedRange(new Date(2026, 11, 28), new Date(2027, 0, 4)).to).toBe('2027-01-03');
  });
});

describe('toEventInput', () => {
  it('makes an all-day end exclusive, as FullCalendar expects', () => {
    const input = toEventInput(item({ startDate: '2026-10-30', endDate: '2026-11-02' }));
    expect(input.start).toBe('2026-10-30');
    expect(input.end).toBe('2026-11-03');
    expect(input.allDay).toBe(true);
  });

  it('passes timed events through as UTC instants', () => {
    const input = toEventInput(
      item({
        isAllDay: false,
        startDate: null,
        endDate: null,
        startsAt: '2026-10-21T10:00:00Z',
        endsAt: '2026-10-21T10:30:00Z',
      }),
    );
    expect(input.start).toBe('2026-10-21T10:00:00Z');
    expect(input.end).toBe('2026-10-21T10:30:00Z');
    expect(input.allDay).toBe(false);
  });

  it('keeps ids unique across sources and styles by source and done state', () => {
    const task = toEventInput(item({ sourceType: 'Task', sourceId: 7, isDone: true }));
    expect(task.id).toBe('Task-7');
    expect(task.className).toBe('lifeos-cal-task lifeos-cal-done');
    expect(task.color).toBe('var(--lifeos-cal-task)');
    expect(toEventInput(item({ sourceId: 7 })).id).toBe('Event-7');
    // Every occurrence of a series shares its id, so the day keeps them apart.
    expect(
      toEventInput(item({ sourceId: 7, isRecurring: true, occurrenceDate: '2026-10-20' })).id,
    ).toBe('Event-7-2026-10-20');
  });
});

describe('local time <-> UTC', () => {
  it('round-trips a local day and time', () => {
    const utc = localDateTimeToUtc('2026-10-21', 15, 30);
    expect(utc).toBe(new Date(2026, 9, 21, 15, 30).toISOString());
    expect(utcToLocalParts(utc)).toEqual({ date: '2026-10-21', hour: 15, minute: 30 });
  });

  it('reads the local day, not the UTC one, near midnight', () => {
    const lateNight = new Date(2026, 9, 31, 23, 45);
    expect(utcToLocalParts(lateNight.toISOString()).date).toBe('2026-10-31');
  });
});
