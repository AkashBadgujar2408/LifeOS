import { daysBetween } from '../dashboard/my-day-view';
import {
  DOCUMENT_KINDS,
  DocumentFile,
  DocumentKind,
  DocumentSummary,
} from '../../core/services/documents.service';

/** How the library and My Day describe a kind. */
export const KIND_META: Record<DocumentKind, { label: string; icon: string }> = {
  Identity: { label: 'Identity', icon: 'bi-person-vcard' },
  Education: { label: 'Education', icon: 'bi-mortarboard' },
  Employment: { label: 'Employment', icon: 'bi-briefcase' },
  Financial: { label: 'Financial', icon: 'bi-bank' },
  Legal: { label: 'Legal', icon: 'bi-file-earmark-ruled' },
  Medical: { label: 'Medical', icon: 'bi-heart-pulse' },
  Other: { label: 'Other', icon: 'bi-file-earmark' },
};

/** Within this many days an expiry is flagged (matches My Day's window). */
export const EXPIRY_SOON_DAYS = 60;

export interface ExpiryStatus {
  state: 'none' | 'valid' | 'soon' | 'today' | 'expired';
  /** Days from today to the expiry (negative once past); null without an expiry. */
  days: number | null;
  /** "Expires in 50 days", "Expired 3 days ago", "Valid until …" (date shown separately). */
  label: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where a document stands against today's (local) date. */
export function expiryStatus(expiresOn: string | null, today: string): ExpiryStatus {
  if (!expiresOn) {
    return { state: 'none', days: null, label: 'No expiry' };
  }
  const days = daysBetween(today, expiresOn);
  if (days < 0) {
    return {
      state: 'expired',
      days,
      label: days === -1 ? 'Expired yesterday' : `Expired ${plural(-days, 'day', 'days')} ago`,
    };
  }
  if (days === 0) {
    return { state: 'today', days, label: 'Expires today' };
  }
  if (days <= EXPIRY_SOON_DAYS) {
    return {
      state: 'soon',
      days,
      label: days === 1 ? 'Expires tomorrow' : `Expires in ${days} days`,
    };
  }
  return { state: 'valid', days, label: 'Valid until' };
}

/** The library's sections: one per kind that has documents, in the fixed kind order, titles A–Z inside. */
export function groupByKind(
  documents: readonly DocumentSummary[],
): { kind: DocumentKind; documents: DocumentSummary[] }[] {
  return DOCUMENT_KINDS.map((kind) => ({
    kind,
    documents: documents
      .filter((d) => d.kind === kind)
      .sort((a, b) => a.title.localeCompare(b.title)),
  })).filter((group) => group.documents.length > 0);
}

/** 512 → "512 B", 2048 → "2 KB", 3_500_000 → "3.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PreviewKind = 'image' | 'pdf' | 'text' | null;

/** What the browser can show inline (HEIC and office files can only be downloaded). */
export function previewKind(file: Pick<DocumentFile, 'contentType'>): PreviewKind {
  switch (file.contentType) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/webp':
      return 'image';
    case 'text/plain':
    case 'text/csv':
      return 'text';
    default:
      return null;
  }
}

/** What the upload box accepts — the same list the API checks (FileRules). */
export const ACCEPTED_FILES =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx,.odt,.ods';

/** Expiry-reminder choices for the editor (days before; 0 = on the day). */
export const EXPIRY_REMINDER_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "Don't remind me" },
  { days: 0, label: 'On the day' },
  { days: 7, label: '1 week before' },
  { days: 30, label: '30 days before' },
  { days: 60, label: '60 days before' },
  { days: 90, label: '90 days before' },
  { days: 180, label: '6 months before' },
];
