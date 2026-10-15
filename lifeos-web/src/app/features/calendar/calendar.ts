import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  CalendarOptions,
  DateSelectInfo,
  DatesSetInfo,
  EventClickInfo,
  FullCalendarModule,
} from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import formaTheme from '@fullcalendar/angular/themes/forma';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import enGbLocale from 'fullcalendar/locales/en-gb';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subscription } from 'rxjs';
import { addDaysIso, todayIso, toLocalIsoDate } from '../../core/dates/today';
import {
  CalendarFeedItem,
  CalendarService,
  CalendarSourceType,
  FeedRange,
} from '../../core/services/calendar.service';
import { TasksService } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { openTaskEditor } from '../tasks/task-editor';
import { SOURCE_LABELS, SOURCE_TYPES, feedRange, toEventInput } from './calendar-feed';
import { EventDraft, openEventEditor } from './event-editor';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';

@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, FullCalendarModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  private readonly calendarService = inject(CalendarService);
  private readonly tasksService = inject(TasksService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly sourceLabels = SOURCE_LABELS;

  protected readonly items = signal<CalendarFeedItem[]>([]);
  protected readonly loading = signal(false);
  /** The last feed load failed: an empty grid would look like a free month, so say so above it. */
  protected readonly loadFailed = signal(false);
  protected readonly hiddenSources = signal<ReadonlySet<CalendarSourceType>>(new Set());

  protected readonly events = computed(() => {
    const hidden = this.hiddenSources();
    return this.items()
      .filter((item) => !hidden.has(item.sourceType))
      .map(toEventInput);
  });

  private range: FeedRange | null = null;
  private feedSubscription: Subscription | null = null;

  protected readonly options: CalendarOptions = {
    plugins: [formaTheme, dayGridPlugin, timeGridPlugin, interactionPlugin],
    // en-gb: weeks start on Monday and titles read "12–18 Oct 2026", in step with the app's 14/Oct/2026 dates.
    locale: enGbLocale,
    initialView: 'dayGridMonth',
    headerToolbar: { start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek' },
    // A fixed height gives the week's time grid its own scroll area, so it opens at scrollTime rather than 00:00.
    // (A per-view `views.timeGridWeek.height` leaves v7's grid at 0px tall — calendar-level only.)
    height: 760,
    scrollTime: '07:00:00',
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dayMaxEvents: true,
    nowIndicator: true,
    selectable: true,
    datesSet: (info) => this.onDatesSet(info),
    select: (info) => this.onSelect(info),
    eventClick: (info) => this.onEventClick(info),
  };

  protected isHidden(source: CalendarSourceType): boolean {
    return this.hiddenSources().has(source);
  }

  protected toggleSource(source: CalendarSourceType): void {
    this.hiddenSources.update((hidden) => {
      const next = new Set(hidden);
      if (!next.delete(source)) {
        next.add(source);
      }
      return next;
    });
  }

  /** "New event" button: today, 09:00–10:00. */
  protected newEvent(): void {
    const today = todayIso();
    void this.openDraft({ isAllDay: false, startDate: today, endDate: today });
  }

  private onDatesSet(info: DatesSetInfo): void {
    this.range = feedRange(info.start, info.end);
    this.loadFeed();
  }

  /** Dragging across days (month) or times (week) starts a new event over exactly that span. */
  private onSelect(info: DateSelectInfo): void {
    const draft: EventDraft = info.allDay
      ? {
          isAllDay: true,
          startDate: toLocalIsoDate(info.start),
          endDate: addDaysIso(toLocalIsoDate(info.end), -1),
        }
      : {
          isAllDay: false,
          startDate: toLocalIsoDate(info.start),
          endDate: toLocalIsoDate(info.end),
          startTime: { hour: info.start.getHours(), minute: info.start.getMinutes(), second: 0 },
          endTime: { hour: info.end.getHours(), minute: info.end.getMinutes(), second: 0 },
        };
    void this.openDraft(draft);
  }

  /** Each source opens where it's edited: events and tasks in place, milestones and goals on their goal. */
  private onEventClick(info: EventClickInfo): void {
    const item = info.event.extendedProps['item'] as CalendarFeedItem;
    switch (item.sourceType) {
      case 'Event':
        this.calendarService
          .getEvent(item.sourceId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: async (event) => {
              const result = await openEventEditor(this.modal, { event });
              // Reload even on dismiss: links added in the editor apply immediately.
              this.loadFeed();
              if (result) {
                this.toast.success(result.kind === 'saved' ? 'Event saved.' : 'Event deleted.');
              }
            },
            error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the event.')),
          });
        break;
      case 'Task':
        this.tasksService
          .get(item.sourceId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: async (task) => {
              const result = await openTaskEditor(this.modal, { task });
              this.loadFeed();
              if (result) {
                this.toast.success(result.kind === 'saved' ? 'Task saved.' : 'Task deleted.');
              }
            },
            error: (err) => this.toast.error(apiErrorMessage(err, 'Could not open the task.')),
          });
        break;
      case 'Milestone':
        void this.router.navigate(['/goals', item.parentId]);
        break;
      case 'Goal':
        void this.router.navigate(['/goals', item.sourceId]);
        break;
    }
  }

  private async openDraft(draft: EventDraft): Promise<void> {
    const result = await openEventEditor(this.modal, { draft });
    if (result?.kind === 'saved') {
      this.toast.success('Event added.');
      this.loadFeed();
    }
  }

  protected loadFeed(): void {
    if (!this.range) {
      return;
    }

    // Paging quickly through months: only the latest range's answer should land.
    this.feedSubscription?.unsubscribe();
    this.loading.set(true);
    this.feedSubscription = this.calendarService
      .feed(this.range)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load the calendar.'));
        },
      });
  }
}
