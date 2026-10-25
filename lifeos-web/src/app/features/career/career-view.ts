import type {
  ApplicationStage,
  SideIncomeKind,
  SideIncomeStatus,
  InterviewQuestion,
  JobApplication,
  CareerAchievementKind,
  Employment,
  EmploymentType,
  SalaryPeriod,
  SalaryReason,
} from '../../core/services/career.service';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FullTime: 'Full-time',
  PartTime: 'Part-time',
  Contract: 'Contract',
  Freelance: 'Freelance',
  Internship: 'Internship',
};

/** "₹16,50,000 a year". */
export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = {
  Year: 'a year',
  Month: 'a month',
  Hour: 'an hour',
};

export const SALARY_REASON_LABELS: Record<SalaryReason, string> = {
  Starting: 'Starting pay',
  Raise: 'Raise',
  Promotion: 'Promotion',
  Adjustment: 'Adjustment',
  Other: 'Other change',
};

export const ACHIEVEMENT_KIND_LABELS: Record<CareerAchievementKind, string> = {
  Project: 'Project',
  Promotion: 'Promotion',
  Award: 'Award',
  Contribution: 'Contribution',
  Other: 'Other',
};

export const ACHIEVEMENT_KIND_ICONS: Record<CareerAchievementKind, string> = {
  Project: 'bi-rocket-takeoff',
  Promotion: 'bi-arrow-up-circle',
  Award: 'bi-award',
  Contribution: 'bi-people',
  Other: 'bi-star',
};

/** A stretch at one organisation: its roles back to back, newest first. */
export interface Stint {
  organisation: string;
  startDate: string;
  /** Null while one of its roles is current. */
  endDate: string | null;
  roles: Employment[];
}

/**
 * The career timeline: roles newest first, with consecutive roles at the same organisation (a promotion, a change
 * of title) grouped into one stint. Going back to an earlier employer after working elsewhere is a new stint.
 */
export function stints(roles: readonly Employment[]): Stint[] {
  const sorted = [...roles].sort((a, b) =>
    a.startDate !== b.startDate ? (a.startDate < b.startDate ? 1 : -1) : b.id - a.id,
  );
  const result: Stint[] = [];
  for (const role of sorted) {
    const last = result[result.length - 1];
    if (last && last.organisation.toLocaleLowerCase() === role.organisation.toLocaleLowerCase()) {
      last.roles.push(role);
      last.startDate = role.startDate;
    } else {
      result.push({
        organisation: role.organisation,
        startDate: role.startDate,
        endDate: role.endDate,
        roles: [role],
      });
    }
  }
  for (const stint of result) {
    stint.endDate = stint.roles.some((r) => r.endDate === null)
      ? null
      : stint.roles.map((r) => r.endDate!).sort()[stint.roles.length - 1];
  }
  return result;
}

/** Roles with no end date, latest start first (usually one; a side contract makes two). */
export function currentRoles(roles: readonly Employment[]): Employment[] {
  return roles
    .filter((r) => r.endDate === null)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}

/** "₹16,50,000 a year", "€70 an hour" — no decimals unless the amount has them. */
export function formatPay(
  amount: number,
  currency: string,
  period: SalaryPeriod,
  locale = 'en-IN',
): string {
  const whole = Number.isInteger(amount);
  let money: string;
  try {
    money = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    // A code Intl doesn't know still reads sensibly.
    money = `${currency} ${amount.toLocaleString(locale)}`;
  }
  return `${money} ${SALARY_PERIOD_LABELS[period]}`;
}

/** "+10%", "−6.7%", "No change"; empty for the first record of its kind. */
export function changeText(percent: number | null): string {
  if (percent === null) {
    return '';
  }
  if (percent === 0) {
    return 'No change';
  }
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  Saved: 'Saved',
  Applied: 'Applied',
  Interview: 'Interviewing',
  Offer: 'Offer',
  Accepted: 'Accepted',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrawn',
};

/** What a move to the stage is called on a button ("Move to Interviewing" reads oddly). */
export const STAGE_MOVE_LABELS: Record<ApplicationStage, string> = {
  Saved: 'Back to saved',
  Applied: 'Applied',
  Interview: 'Interviewing',
  Offer: 'Got an offer',
  Accepted: 'Accepted the offer',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrew',
};

export const STAGE_ICONS: Record<ApplicationStage, string> = {
  Saved: 'bi-bookmark',
  Applied: 'bi-send',
  Interview: 'bi-chat-dots',
  Offer: 'bi-envelope-paper',
  Accepted: 'bi-check-circle',
  Rejected: 'bi-x-circle',
  Withdrawn: 'bi-box-arrow-left',
};

export const CLOSED_STAGES: readonly ApplicationStage[] = ['Accepted', 'Rejected', 'Withdrawn'];

export interface BoardColumn {
  key: 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Closed';
  label: string;
  applications: JobApplication[];
}

/**
 * The applications board: one column per open stage, then Closed (accepted, rejected, withdrawn). Interviewing
 * applications with a round coming up go first, soonest first; everything else most recent move first.
 */
export function boardColumns(applications: readonly JobApplication[]): BoardColumn[] {
  const columns: BoardColumn[] = [
    { key: 'Saved', label: 'Saved', applications: [] },
    { key: 'Applied', label: 'Applied', applications: [] },
    { key: 'Interview', label: 'Interviewing', applications: [] },
    { key: 'Offer', label: 'Offer', applications: [] },
    { key: 'Closed', label: 'Closed', applications: [] },
  ];
  for (const application of applications) {
    const key = CLOSED_STAGES.includes(application.stage)
      ? 'Closed'
      : (application.stage as BoardColumn['key']);
    columns.find((c) => c.key === key)!.applications.push(application);
  }
  const bySince = (a: JobApplication, b: JobApplication) =>
    (b.stageSince ?? '').localeCompare(a.stageSince ?? '') || b.id - a.id;
  for (const column of columns) {
    column.applications.sort((a, b) =>
      a.nextInterviewAt && b.nextInterviewAt
        ? a.nextInterviewAt.localeCompare(b.nextInterviewAt)
        : a.nextInterviewAt
          ? -1
          : b.nextInterviewAt
            ? 1
            : bySince(a, b),
    );
  }
  return columns;
}

/** Whole calendar days from one ISO day to another (no clock, so no DST drift). */
export function daysBetween(from: string, to: string): number {
  const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** A mock interview's heading: the role it was for (its own, else the application's), else "General practice". */
export function mockTitle(mock: { role: string | null; applicationTitle: string | null }): string {
  return mock.role ?? mock.applicationTitle ?? 'General practice';
}

/** "Practised today", "Practised 3 days ago", "Not practised yet". */
export function practisedText(lastPractisedOn: string | null, today: string): string {
  if (!lastPractisedOn) {
    return 'Not practised yet';
  }
  const days = daysBetween(lastPractisedOn, today);
  return days <= 0
    ? 'Practised today'
    : days === 1
      ? 'Practised yesterday'
      : `Practised ${days} days ago`;
}

/**
 * The question bank filter: every word must appear in the question, the answer or the review notes (any case),
 * and the question must carry the tag when one is chosen.
 */
export function filterQuestions(
  questions: readonly InterviewQuestion[],
  filter: { text: string; tagId: number | null },
): InterviewQuestion[] {
  const words = filter.text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return questions.filter((q) => {
    if (filter.tagId !== null && !q.tags.some((t) => t.id === filter.tagId)) {
      return false;
    }
    const haystack = [q.question, q.answer ?? '', q.reviewNotes ?? '']
      .join(' ')
      .toLocaleLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export const SIDE_INCOME_KIND_LABELS: Record<SideIncomeKind, string> = {
  Freelance: 'Freelance',
  Content: 'Content',
  Consulting: 'Consulting',
  Teaching: 'Teaching',
  Other: 'Other',
};

export const SIDE_INCOME_KIND_ICONS: Record<SideIncomeKind, string> = {
  Freelance: 'bi-laptop',
  Content: 'bi-camera-video',
  Consulting: 'bi-chat-left-text',
  Teaching: 'bi-easel',
  Other: 'bi-coin',
};

export const SIDE_INCOME_STATUS_LABELS: Record<SideIncomeStatus, string> = {
  Active: 'Going',
  Paused: 'Paused',
  Ended: 'Ended',
};

/** How long it's been since you were last in touch with someone before it's worth a nudge on the network page. */
export const CATCH_UP_DAYS = 90;

/** "In touch today", "Last in touch 12 days ago", "Not in touch yet". */
export function contactedText(lastContactedOn: string | null, today: string): string {
  if (!lastContactedOn) {
    return 'No contact recorded';
  }
  const days = daysBetween(lastContactedOn, today);
  return days <= 0
    ? 'In touch today'
    : days === 1
      ? 'In touch yesterday'
      : `Last in touch ${days} days ago`;
}

/**
 * The network, longest out of touch first (never recorded counts as longest), names breaking ties — so the people
 * worth catching up with come up top. `catchUp` marks those over CATCH_UP_DAYS (or never recorded).
 */
export function networkOrder<T extends { name: string; lastContactedOn: string | null }>(
  contacts: readonly T[],
  today: string,
): (T & { catchUp: boolean })[] {
  return [...contacts]
    .sort(
      (a, b) =>
        (a.lastContactedOn ?? '').localeCompare(b.lastContactedOn ?? '') ||
        a.name.localeCompare(b.name),
    )
    .map((c) => ({
      ...c,
      catchUp: !c.lastContactedOn || daysBetween(c.lastContactedOn, today) > CATCH_UP_DAYS,
    }));
}
