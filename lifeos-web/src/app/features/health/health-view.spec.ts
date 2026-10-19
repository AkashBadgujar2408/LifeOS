import type { DoctorVisit, Dose, Medication } from '../../core/services/health.service';
import {
  doseCounts,
  followUpsDue,
  medicationGroups,
  medicationState,
  timeLabel,
  visitBuckets,
} from './health-view';

const visit = (id: number, visitOn: string, extra: Partial<DoctorVisit> = {}): DoctorVisit => ({
  id,
  reason: `Visit ${id}`,
  visitOn,
  contactId: null,
  contactName: null,
  specialty: null,
  place: null,
  conditionId: null,
  conditionName: null,
  startsAt: null,
  endsAt: null,
  eventId: null,
  followUpOn: null,
  notes: null,
  prescribed: [],
  ...extra,
});

const medication = (id: number, extra: Partial<Medication> = {}): Medication => ({
  id,
  name: `Med ${id}`,
  strength: null,
  startDate: '2026-10-01',
  endDate: null,
  isAsNeeded: false,
  conditionId: null,
  conditionName: null,
  prescribedAtVisitId: null,
  notes: null,
  schedules: [],
  adherence: null,
  takenLast30Days: 0,
  lastTakenOn: null,
  ...extra,
});

describe('health view', () => {
  const today = '2026-10-19';

  it('splits visits into upcoming (today first) and past (newest first)', () => {
    const { upcoming, past } = visitBuckets(
      [
        visit(1, '2026-10-01'),
        visit(2, '2026-10-25'),
        visit(3, today, { startsAt: '2026-10-19T09:00:00Z' }),
        visit(4, today, { startsAt: '2026-10-19T04:00:00Z' }),
        visit(5, '2026-10-18'),
      ],
      today,
    );
    expect(upcoming.map((v) => v.id)).toEqual([4, 3, 2]);
    expect(past.map((v) => v.id)).toEqual([5, 1]);
  });

  it('lists follow-ups still ahead, soonest first', () => {
    const due = followUpsDue(
      [
        visit(1, '2026-09-01', { followUpOn: '2026-10-10' }),
        visit(2, '2026-10-01', { followUpOn: '2026-12-01' }),
        visit(3, '2026-10-02', { followUpOn: today }),
        visit(4, '2026-10-03'),
      ],
      today,
    );
    expect(due.map((v) => v.id)).toEqual([3, 2]);
  });

  it('groups medicines by whether they are being taken', () => {
    expect(medicationState(medication(1), today)).toBe('current');
    expect(medicationState(medication(1, { endDate: today }), today)).toBe('current');
    expect(medicationState(medication(1, { endDate: '2026-10-18' }), today)).toBe('stopped');
    expect(medicationState(medication(1, { startDate: '2026-10-20' }), today)).toBe('upcoming');

    const groups = medicationGroups(
      [
        medication(1, { name: 'Zinc', isAsNeeded: true }),
        medication(2, { name: 'Metformin' }),
        medication(3, { name: 'Amoxicillin', endDate: '2026-10-10' }),
        medication(4, { name: 'Aspirin' }),
      ],
      today,
    );
    expect(groups.current.map((m) => m.name)).toEqual(['Aspirin', 'Metformin', 'Zinc']);
    expect(groups.stopped.map((m) => m.name)).toEqual(['Amoxicillin']);
  });

  it('writes times the app way', () => {
    expect(timeLabel('08:00')).toBe('8:00 AM');
    expect(timeLabel('00:05')).toBe('12:05 AM');
    expect(timeLabel('12:30')).toBe('12:30 PM');
    expect(timeLabel('20:00')).toBe('8:00 PM');
  });

  it('counts doses done (taken or skipped) and taken', () => {
    const dose = (status: Dose['status']): Dose => ({
      medicationId: 1,
      medicationName: 'M',
      strength: null,
      scheduleId: 1,
      timeOfDay: '08:00',
      dose: null,
      status,
      takenAt: null,
    });
    expect(doseCounts([dose('Taken'), dose('Skipped'), dose(null)])).toEqual({
      due: 3,
      done: 2,
      taken: 1,
    });
  });
});
