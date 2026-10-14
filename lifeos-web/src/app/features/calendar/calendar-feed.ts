import type { EventInput } from '@fullcalendar/angular';
import { addDaysIso, localMidnight, toLocalIsoDate } from '../../core/dates/today';
import {
  CalendarFeedItem,
  CalendarSourceType,
  FeedRange,
} from '../../core/services/calendar.service';

export const SOURCE_TYPES: CalendarSourceType[] = ['Event', 'Task', 'Milestone', 'Goal'];

export const SOURCE_LABELS: Record<CalendarSourceType, string> = {
  Event: 'Events',
  Task: 'Tasks',
  Milestone: 'Milestones',
  Goal: 'Goal targets',
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

/** Feed item → FullCalendar event. IDs are prefixed by source, since a task and an event can share a number. */
export function toEventInput(item: CalendarFeedItem): EventInput {
  const source = item.sourceType.toLowerCase();
  // FullCalendar v7 takes a single space-separated class string, not an array.
  const className = item.isDone ? `lifeos-cal-${source} lifeos-cal-done` : `lifeos-cal-${source}`;

  return {
    id: `${item.sourceType}-${item.sourceId}`,
    title: item.title,
    allDay: item.isAllDay,
    // All-day: FullCalendar's end is exclusive, the API's is inclusive. Timed: UTC instants, shown in local time.
    start: item.isAllDay ? item.startDate! : item.startsAt!,
    end: item.isAllDay ? addDaysIso(item.endDate!, 1) : item.endsAt!,
    className,
    // FullCalendar puts this into the event's --fc-event-color; the variables are defined in calendar.scss.
    color: `var(--lifeos-cal-${source})`,
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
