import { CalendarFeedItem } from '../../core/services/calendar.service';
import {
  droppedSchedule,
  feedRange,
  formatMinutes,
  localDateTimeToUtc,
  timeByLifeArea,
  toEventInput,
  utcToLocalParts,
} from './calendar-feed';

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
  lifeAreaId: null,
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

describe('droppedSchedule', () => {
  it('gives an all-day drop its inclusive last day', () => {
    // Dropped on 20–22 Oct: FullCalendar's end is local midnight after the 22nd.
    expect(droppedSchedule(new Date(2026, 9, 20), new Date(2026, 9, 23), true)).toEqual({
      isAllDay: true,
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      startsAt: null,
      endsAt: null,
    });
  });

  it('makes an event dropped into the all-day row without an end one day long', () => {
    const schedule = droppedSchedule(new Date(2026, 9, 20), null, true);
    expect([schedule.startDate, schedule.endDate]).toEqual(['2026-10-20', '2026-10-20']);
  });

  it('sends timed drops as UTC instants, an hour long when FullCalendar gives no end', () => {
    const start = new Date(2026, 9, 20, 14, 30);
    expect(droppedSchedule(start, new Date(2026, 9, 20, 16, 0), false)).toEqual({
      isAllDay: false,
      startDate: null,
      endDate: null,
      startsAt: start.toISOString(),
      endsAt: new Date(2026, 9, 20, 16, 0).toISOString(),
    });
    expect(droppedSchedule(start, null, false).endsAt).toBe(
      new Date(2026, 9, 20, 15, 30).toISOString(),
    );
  });
});

describe('timeByLifeArea', () => {
  const from = '2026-10-19T00:00:00.000Z';
  const to = '2026-10-26T00:00:00.000Z';
  const timed = (startsAt: string, endsAt: string, lifeAreaId: number | null) =>
    item({ isAllDay: false, startDate: null, endDate: null, startsAt, endsAt, lifeAreaId });

  it('adds up timed events per life area, most first, and leaves all-day events and tasks out', () => {
    const totals = timeByLifeArea(
      [
        timed('2026-10-20T09:00:00Z', '2026-10-20T11:00:00Z', 3),
        timed('2026-10-21T09:00:00Z', '2026-10-21T10:30:00Z', 3),
        timed('2026-10-22T18:00:00Z', '2026-10-22T19:00:00Z', 1),
        timed('2026-10-22T20:00:00Z', '2026-10-22T20:45:00Z', null),
        item({ lifeAreaId: 2 }), // all-day
        item({ sourceType: 'Task', isAllDay: false, startsAt: from, endsAt: to }),
      ],
      from,
      to,
    );
    expect(totals).toEqual([
      { lifeAreaId: 3, minutes: 210 },
      { lifeAreaId: 1, minutes: 60 },
      { lifeAreaId: null, minutes: 45 },
    ]);
  });

  it('counts only the part of an event inside the span', () => {
    const totals = timeByLifeArea(
      [
        timed('2026-10-18T23:00:00Z', '2026-10-19T01:00:00Z', 1),
        timed('2026-10-25T23:30:00Z', '2026-10-26T02:00:00Z', 1),
        timed('2026-10-26T09:00:00Z', '2026-10-26T10:00:00Z', 2),
      ],
      from,
      to,
    );
    expect(totals).toEqual([{ lifeAreaId: 1, minutes: 90 }]);
  });
});

describe('formatMinutes', () => {
  it('reads as hours and minutes', () => {
    expect([formatMinutes(45), formatMinutes(120), formatMinutes(90), formatMinutes(0)]).toEqual([
      '45m',
      '2h',
      '1h 30m',
      '0m',
    ]);
  });
});
