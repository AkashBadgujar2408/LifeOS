/** A piece of result text, and whether it's part of what was searched for. */
export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Splits text so every case-insensitive occurrence of the query can be shown in bold. The query is matched as typed
 * (trimmed), the way the server matched it — not word by word.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [{ text, match: false }];
  }

  const parts: TextPart[] = [];
  const haystack = text.toLowerCase();
  let from = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, from)) {
    if (at > from) {
      parts.push({ text: text.slice(from, at), match: false });
    }
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from), match: false });
  }
  return parts;
}

/** Bootstrap Icons per searchable type, the same ones the sidebar uses for their modules. */
export const SEARCH_TYPE_ICONS: Record<string, string> = {
  Goal: 'bi-flag',
  Task: 'bi-check2-square',
  Project: 'bi-kanban',
  Event: 'bi-calendar3',
  Habit: 'bi-arrow-repeat',
  JournalEntry: 'bi-journal-text',
  InboxItem: 'bi-inbox',
  Document: 'bi-folder2-open',
  Decision: 'bi-signpost-split',
  Skill: 'bi-mortarboard',
  Course: 'bi-easel',
  MediaItem: 'bi-collection-play',
  Hobby: 'bi-palette',
  Roadmap: 'bi-signpost-split',
  Certification: 'bi-patch-check',
  KnowledgeNote: 'bi-lightbulb',
  Contact: 'bi-person',
  Employment: 'bi-briefcase',
  CareerAchievement: 'bi-trophy',
  JobApplication: 'bi-kanban',
  InterviewQuestion: 'bi-chat-square-quote',
  MockInterview: 'bi-mic',
  ResumeVersion: 'bi-file-earmark-person',
  FinanceAccount: 'bi-bank',
  Transaction: 'bi-receipt',
  Holding: 'bi-graph-up-arrow',
  Loan: 'bi-bank2',
  InsurancePolicy: 'bi-shield-check',
  TaxItem: 'bi-file-earmark-text',
  DoctorVisit: 'bi-hospital',
  Medication: 'bi-capsule',
  MedicalCondition: 'bi-heart-pulse',
  LabResult: 'bi-clipboard2-data',
  Property: 'bi-house-door',
  Asset: 'bi-box-seam',
  Vehicle: 'bi-car-front',
  Warranty: 'bi-patch-check',
  MaintenanceTask: 'bi-tools',
  UtilityBill: 'bi-receipt',
  Purchase: 'bi-bag',
  ShoppingList: 'bi-cart3',
  WishlistItem: 'bi-gift',
  Return: 'bi-arrow-return-left',
  Benefit: 'bi-ticket-perforated',
  Subscription: 'bi-arrow-repeat',
};

/** The next highlighted row for an arrow key: wraps around at either end, -1 when there are no rows. */
export function moveActive(active: number, count: number, step: 1 | -1): number {
  if (count === 0) {
    return -1;
  }
  if (active < 0) {
    return step === 1 ? 0 : count - 1;
  }
  return (active + step + count) % count;
}

/** Group headings; a type not listed (a later module) uses the API's display name. */
export const SEARCH_GROUP_LABELS: Record<string, string> = {
  Goal: 'Goals',
  Task: 'Tasks',
  Project: 'Projects',
  Event: 'Events',
  Habit: 'Habits',
  JournalEntry: 'Journal',
  InboxItem: 'Inbox',
  Document: 'Documents',
  Decision: 'Decisions',
  Skill: 'Skills',
  Course: 'Courses',
  MediaItem: 'Books & media',
  Hobby: 'Hobbies',
  Roadmap: 'Roadmaps',
  Certification: 'Certifications',
  KnowledgeNote: 'Notes',
  Contact: 'Contacts',
  Employment: 'Roles',
  CareerAchievement: 'Career achievements',
  JobApplication: 'Job applications',
  InterviewQuestion: 'Interview questions',
  MockInterview: 'Mock interviews',
  ResumeVersion: 'Resume versions',
  FinanceAccount: 'Accounts',
  Transaction: 'Transactions',
  Holding: 'Investments',
  Loan: 'Loans',
  InsurancePolicy: 'Insurance',
  TaxItem: 'Tax items',
  DoctorVisit: 'Doctor visits',
  Medication: 'Medicines',
  MedicalCondition: 'Medical history',
  LabResult: 'Lab results',
  Property: 'Properties',
  Asset: 'Inventory',
  Vehicle: 'Vehicles',
  Warranty: 'Warranties',
  MaintenanceTask: 'Maintenance',
  UtilityBill: 'Bills',
  Purchase: 'Purchases',
  ShoppingList: 'Shopping lists',
  WishlistItem: 'Wishlist',
  Return: 'Returns',
  Benefit: 'Rewards & vouchers',
  Subscription: 'Subscriptions',
};
