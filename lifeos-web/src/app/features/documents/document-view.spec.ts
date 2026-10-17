import { DocumentSummary } from '../../core/services/documents.service';
import { expiryStatus, formatBytes, groupByKind, previewKind } from './document-view';

const TODAY = '2026-10-17';

describe('expiryStatus', () => {
  it('reads each side of today in words', () => {
    expect(expiryStatus(null, TODAY)).toEqual({ state: 'none', days: null, label: 'No expiry' });
    expect(expiryStatus('2026-12-06', TODAY)).toEqual({
      state: 'soon',
      days: 50,
      label: 'Expires in 50 days',
    });
    expect(expiryStatus('2026-10-18', TODAY).label).toBe('Expires tomorrow');
    expect(expiryStatus(TODAY, TODAY).state).toBe('today');
    expect(expiryStatus('2026-10-16', TODAY).label).toBe('Expired yesterday');
    expect(expiryStatus('2026-10-14', TODAY)).toEqual({
      state: 'expired',
      days: -3,
      label: 'Expired 3 days ago',
    });
  });

  it('flags up to 60 days ahead, and counts whole days across a clock change', () => {
    expect(expiryStatus('2026-12-16', TODAY).state).toBe('soon'); // 60 days
    expect(expiryStatus('2026-12-17', TODAY).state).toBe('valid'); // 61
    // 25 Oct (Europe) / 1 Nov (US) clock changes sit between these.
    expect(expiryStatus('2026-11-17', TODAY).days).toBe(31);
  });
});

describe('groupByKind', () => {
  const doc = (id: number, kind: DocumentSummary['kind'], title: string) =>
    ({ id, kind, title }) as DocumentSummary;

  it('keeps the fixed kind order, drops empty kinds and sorts titles', () => {
    const groups = groupByKind([
      doc(1, 'Medical', 'Vaccination card'),
      doc(2, 'Identity', 'Passport'),
      doc(3, 'Identity', 'Driving licence'),
    ]);
    expect(groups.map((g) => [g.kind, g.documents.map((d) => d.id)])).toEqual([
      ['Identity', [3, 2]],
      ['Medical', [1]],
    ]);
  });
});

describe('formatBytes / previewKind', () => {
  it('formats sizes', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(3_500_000)]).toEqual([
      '512 B',
      '2 KB',
      '3.3 MB',
    ]);
  });

  it('previews what browsers can show and nothing else', () => {
    expect(previewKind({ contentType: 'application/pdf' })).toBe('pdf');
    expect(previewKind({ contentType: 'image/jpeg' })).toBe('image');
    expect(previewKind({ contentType: 'text/csv' })).toBe('text');
    expect(previewKind({ contentType: 'image/heic' })).toBeNull();
    expect(
      previewKind({
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBeNull();
  });
});
