import type { EventInput } from '@fullcalendar/angular';
import { addDaysIso, localMidnight, toLocalIsoDate } from '../../core/dates/today';
import {
  CalendarFeedItem,
  CalendarSourceType,
  FeedRange,
  EventSchedule,
} from '../../core/services/calendar.service';

export const SOURCE_TYPES: CalendarSourceType[] = [
  'Event',
  'Task',
  'Milestone',
  'Goal',
  'TaxItem',
  'UtilityBill',
];

export const SOURCE_LABELS: Record<CalendarSourceType, string> = {
  Event: 'Events',
  Task: 'Tasks',
  Milestone: 'Milestones',
  Goal: 'Goal targets',
  TaxItem: 'Tax deadlines',
  UtilityBill: 'Bills',
};

/**
 * The feed request for what the calendar is showing. FullCalendar hands us the visible span as local Dates with an
 * exclusive end (local midnight after the last day). The API wants the local days inclusively *and* the same span
 * as UTC instants — only the browser knows the user's timezone, so this is the one place that conversion happens.
 */
export function feedRange(start: Date, end: Date): FeedRange {
  return {
    from: toLocalIsoDate(start),
    to: addDaysIso(toLocalIsoDate(end), -1),
    fromUtc: start.toISOString(),
    toUtc: end.toISOString(),
  };
}

/**
 * Feed item → FullCalendar event. IDs are prefixed by source, since a task and an event can share a number, and an
 * occurrence of a recurring event adds its day, since every occurrence shares the series' id.
 */
export function toEventInput(item: CalendarFeedItem): EventInput {
  const source = item.sourceType.toLowerCase();
  // FullCalendar v7 takes a single space-separated class string, not an array.
  const className = item.isDone ? `lifeos-cal-${source} lifeos-cal-done` : `lifeos-cal-${source}`;

  return {
    id: item.occurrenceDate
      ? `${item.sourceType}-${item.sourceId}-${item.occurrenceDate}`
      : `${item.sourceType}-${item.sourceId}`,
    title: item.title,
    allDay: item.isAllDay,
    // All-day: FullCalendar's end is exclusive, the API's is inclusive. Timed: UTC instants, shown in local time.
    start: item.isAllDay ? item.startDate! : item.startsAt!,
    end: item.isAllDay ? addDaysIso(item.endDate!, 1) : item.endsAt!,
    className,
    // FullCalendar puts this into the event's --fc-event-color; the variables are defined in calendar.scss.
    color: `var(--lifeos-cal-${source})`,
    // Only events move by dragging: a task due date or a goal target is changed where it lives.
    editable: item.sourceType === 'Event',
    extendedProps: { item },
  };
}

/** A local day + "HH:mm" → the UTC instant the API stores ("…Z"). */
export function localDateTimeToUtc(isoDate: string, hour: number, minute: number): string {
  const date = localMidnight(isoDate);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/** A UTC instant → the local day and time it falls on, for the editor's date + time inputs. */
export function utcToLocalParts(utc: string): { date: string; hour: number; minute: number } {
  const date = new Date(utc);
  return { date: toLocalIsoDate(date), hour: date.getHours(), minute: date.getMinutes() };
}

/**
 * Where FullCalendar dropped (or resized) an event → the API's dates/times. FullCalendar's end is exclusive and
 * can be null when an event changes kind: dragged from the all-day row into the time grid it has no end yet (an hour,
 * FullCalendar's default length), dragged out of the grid into the all-day row it's one day.
 */
export function droppedSchedule(start: Date, end: Date | null, allDay: boolean): EventSchedule {
  if (allDay) {
    const startDate = toLocalIsoDate(start);
    return {
      isAllDay: true,
      startDate,
      endDate: end ? addDaysIso(toLocalIsoDate(end), -1) : startDate,
      startsAt: null,
      endsAt: null,
    };
  }
  return {
    isAllDay: false,
    startDate: null,
    endDate: null,
    startsAt: start.toISOString(),
    endsAt: (end ?? new Date(start.getTime() + 60 * 60000)).toISOString(),
  };
}

/** Minutes of timed events given to one life area (null = events without one). */
export interface LifeAreaTime {
  lifeAreaId: number | null;
  minutes: number;
}

/**
 * Time blocking totals for the visible span: minutes of timed events per life area, the part of each event inside
 * [fromUtc, toUtc) only, most first (then by area id; "no life area" last among equals). All-day events, tasks and
 * goal dates aren't blocks of time, so they don't count.
 */
export function timeByLifeArea(
  items: readonly CalendarFeedItem[],
  fromUtc: string,
  toUtc: string,
): LifeAreaTime[] {
  const from = Date.parse(fromUtc);
  const to = Date.parse(toUtc);
  const totals = new Map<number | null, number>();
  for (const item of items) {
    if (item.sourceType !== 'Event' || item.isAllDay) {
      continue;
    }
    const start = Math.max(Date.parse(item.startsAt!), from);
    const end = Math.min(Date.parse(item.endsAt!), to);
    if (end > start) {
      totals.set(item.lifeAreaId, (totals.get(item.lifeAreaId) ?? 0) + (end - start) / 60000);
    }
  }
  return [...totals]
    .map(([lifeAreaId, minutes]) => ({ lifeAreaId, minutes: Math.round(minutes) }))
    .sort(
      (a, b) =>
        b.minutes - a.minutes ||
        (a.lifeAreaId ?? Number.MAX_SAFE_INTEGER) - (b.lifeAreaId ?? Number.MAX_SAFE_INTEGER),
    );
}

/** 90 → "1h 30m", 120 → "2h", 45 → "45m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
