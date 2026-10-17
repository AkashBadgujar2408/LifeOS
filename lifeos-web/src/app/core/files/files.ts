// Shared by everything that shows stored files (document files, attachments).

/** What upload boxes accept — the same list the API checks (FileRules). */
export const ACCEPTED_FILES =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.txt,.csv,.doc,.docx,.xls,.xlsx,.odt,.ods';

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
export function previewKind(file: { contentType: string }): PreviewKind {
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

/** Bootstrap icon for a file row. */
export function fileIcon(file: { contentType: string }): string {
  switch (previewKind(file)) {
    case 'pdf':
      return 'bi-file-earmark-pdf';
    case 'image':
      return 'bi-file-earmark-image';
    case 'text':
      return 'bi-file-earmark-text';
    default:
      return 'bi-file-earmark';
  }
}

/** Saves bytes the app already fetched under the file's own name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before letting go of the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Shows bytes the app already fetched in a new tab, the way the browser shows a PDF, photo or text file. */
export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
