import type {
  Employment,
  InterviewQuestion,
  JobApplication,
} from '../../core/services/career.service';
import {
  boardColumns,
  changeText,
  currentRoles,
  filterQuestions,
  formatPay,
  practisedText,
  stints,
} from './career-view';

function role(
  id: number,
  organisation: string,
  startDate: string,
  endDate: string | null,
  title = `Role ${id}`,
): Employment {
  return {
    id,
    organisation,
    role: title,
    employmentType: 'FullTime',
    location: null,
    startDate,
    endDate,
    description: null,
    achievementCount: 0,
  };
}

describe('stints', () => {
  it('groups back-to-back roles at one organisation, newest first', () => {
    const result = stints([
      role(1, 'Initech', '2019-07-01', '2021-12-31'),
      role(2, 'Acme Corp', '2022-01-10', '2024-03-31', 'Developer'),
      role(3, 'acme corp', '2024-04-01', null, 'Senior Developer'),
    ]);
    expect(result.map((s) => s.organisation)).toEqual(['acme corp', 'Initech']);
    expect(result[0].roles.map((r) => r.role)).toEqual(['Senior Developer', 'Developer']);
    expect(result[0].startDate).toBe('2022-01-10');
    expect(result[0].endDate).toBeNull();
    expect(result[1].endDate).toBe('2021-12-31');
  });

  it('makes going back to an earlier employer a new stint', () => {
    const result = stints([
      role(1, 'Acme', '2018-01-01', '2019-12-31'),
      role(2, 'Globex', '2020-01-01', '2021-12-31'),
      role(3, 'Acme', '2022-01-01', null),
    ]);
    expect(result.map((s) => s.organisation)).toEqual(['Acme', 'Globex', 'Acme']);
  });
});

describe('currentRoles', () => {
  it('keeps roles with no end date, latest first', () => {
    const result = currentRoles([
      role(1, 'A', '2020-01-01', null),
      role(2, 'B', '2021-01-01', '2022-01-01'),
      role(3, 'C', '2024-01-01', null),
    ]);
    expect(result.map((r) => r.id)).toEqual([3, 1]);
  });
});

describe('formatPay + changeText', () => {
  it('reads money with its period', () => {
    expect(formatPay(1650000, 'INR', 'Year')).toBe('₹16,50,000 a year');
    expect(formatPay(70, 'EUR', 'Hour', 'en-GB')).toBe('€70 an hour');
    expect(formatPay(12.5, 'USD', 'Hour', 'en-US')).toBe('$12.50 an hour');
  });

  it('signs the change', () => {
    expect(changeText(null)).toBe('');
    expect(changeText(0)).toBe('No change');
    expect(changeText(25)).toBe('+25%');
    expect(changeText(-6.7)).toBe('−6.7%');
  });
});

function application(
  id: number,
  stage: JobApplication['stage'],
  stageSince: string,
  nextInterviewAt: string | null = null,
): JobApplication {
  return {
    id,
    organisation: `Org ${id}`,
    role: 'Engineer',
    stage,
    appliedOn: null,
    closedOn: null,
    stageSince,
    source: null,
    url: null,
    contactId: null,
    contactName: null,
    resumeVersionId: null,
    resumeVersionName: null,
    notes: null,
    interviewCount: nextInterviewAt ? 1 : 0,
    nextInterviewAt,
  };
}

describe('boardColumns', () => {
  it('puts each open stage in its column and every closed one under Closed', () => {
    const columns = boardColumns([
      application(1, 'Saved', '2026-10-01'),
      application(2, 'Rejected', '2026-10-02'),
      application(3, 'Accepted', '2026-10-03'),
      application(4, 'Offer', '2026-10-04'),
    ]);
    expect(columns.map((c) => c.key)).toEqual(['Saved', 'Applied', 'Interview', 'Offer', 'Closed']);
    expect(columns[0].applications.map((a) => a.id)).toEqual([1]);
    expect(columns[3].applications.map((a) => a.id)).toEqual([4]);
    expect(columns[4].applications.map((a) => a.id)).toEqual([3, 2]);
  });

  it('puts a round coming up first, soonest first, then the most recent moves', () => {
    const columns = boardColumns([
      application(1, 'Interview', '2026-10-10'),
      application(2, 'Interview', '2026-10-01', '2026-10-25T09:00:00Z'),
      application(3, 'Interview', '2026-10-12'),
      application(4, 'Interview', '2026-10-02', '2026-10-20T09:00:00Z'),
    ]);
    expect(columns[2].applications.map((a) => a.id)).toEqual([4, 2, 3, 1]);
  });
});

describe('practisedText', () => {
  it('counts calendar days', () => {
    expect(practisedText(null, '2026-10-18')).toBe('Not practised yet');
    expect(practisedText('2026-10-18', '2026-10-18')).toBe('Practised today');
    expect(practisedText('2026-10-17', '2026-10-18')).toBe('Practised yesterday');
    // Across the end of DST in Europe/US: still whole days.
    expect(practisedText('2026-10-20', '2026-11-03')).toBe('Practised 14 days ago');
  });
});

describe('filterQuestions', () => {
  const questions: InterviewQuestion[] = [
    {
      id: 1,
      question: 'Design a rate limiter',
      answer: 'Token bucket per key',
      reviewNotes: null,
      lastPractisedOn: null,
      jobApplicationId: null,
      applicationTitle: null,
      tags: [{ id: 7, name: 'System design' }],
    },
    {
      id: 2,
      question: 'Tell me about a conflict',
      answer: null,
      reviewNotes: 'Use the payments story',
      lastPractisedOn: null,
      jobApplicationId: null,
      applicationTitle: null,
      tags: [],
    },
  ];

  it('matches every word anywhere in the question, answer or notes', () => {
    expect(
      filterQuestions(questions, { text: 'TOKEN limiter', tagId: null }).map((q) => q.id),
    ).toEqual([1]);
    expect(filterQuestions(questions, { text: 'payments', tagId: null }).map((q) => q.id)).toEqual([
      2,
    ]);
    expect(filterQuestions(questions, { text: '', tagId: null })).toHaveLength(2);
  });

  it('narrows to a tag', () => {
    expect(filterQuestions(questions, { text: '', tagId: 7 }).map((q) => q.id)).toEqual([1]);
  });
});
