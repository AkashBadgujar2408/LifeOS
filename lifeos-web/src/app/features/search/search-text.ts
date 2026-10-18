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
  Book: 'bi-book-half',
  Roadmap: 'bi-signpost-split',
  Certification: 'bi-patch-check',
  KnowledgeNote: 'bi-lightbulb',
  Contact: 'bi-person',
  Employment: 'bi-briefcase',
  CareerAchievement: 'bi-trophy',
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
  Book: 'Books',
  Roadmap: 'Roadmaps',
  Certification: 'Certifications',
  KnowledgeNote: 'Notes',
  Contact: 'Contacts',
  Employment: 'Roles',
  CareerAchievement: 'Career achievements',
};
