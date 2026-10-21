import type { MediaItem, MediaKind, MediaStatus } from '../../core/services/leisure.service';

/** Singular and plural words and an icon per kind. */
export const MEDIA_KIND_INFO: Record<MediaKind, { one: string; many: string; icon: string }> = {
  Book: { one: 'Book', many: 'Books', icon: 'bi-book-half' },
  Film: { one: 'Film', many: 'Films', icon: 'bi-film' },
  Series: { one: 'Series', many: 'Series', icon: 'bi-tv' },
  Game: { one: 'Game', many: 'Games', icon: 'bi-controller' },
  Album: { one: 'Album', many: 'Albums', icon: 'bi-vinyl' },
  Podcast: { one: 'Podcast', many: 'Podcasts', icon: 'bi-mic' },
  Other: { one: 'Other', many: 'Other', icon: 'bi-collection-play' },
};

/** Status words, by kind where the verb matters ("Reading now" for a book, "Watching" for a show). */
export function statusLabel(kind: MediaKind, status: MediaStatus): string {
  switch (status) {
    case 'InProgress':
      return IN_PROGRESS_WORD[kind];
    case 'Want':
      return WANT_WORD[kind];
    case 'Finished':
      return 'Finished';
    default:
      return 'Dropped';
  }
}

const IN_PROGRESS_WORD: Record<MediaKind, string> = {
  Book: 'Reading now',
  Film: 'Watching',
  Series: 'Watching',
  Game: 'Playing',
  Album: 'Listening',
  Podcast: 'Listening',
  Other: 'In progress',
};

const WANT_WORD: Record<MediaKind, string> = {
  Book: 'Want to read',
  Film: 'Want to watch',
  Series: 'Want to watch',
  Game: 'Want to play',
  Album: 'Want to hear',
  Podcast: 'Want to hear',
  Other: 'Want to try',
};

/** What the creator field is called for a kind. */
export function creatorLabel(kind: MediaKind): string {
  switch (kind) {
    case 'Book':
      return 'Author';
    case 'Film':
      return 'Director';
    case 'Series':
      return 'Created by';
    case 'Game':
      return 'Studio';
    case 'Album':
      return 'Artist';
    case 'Podcast':
      return 'Host';
    default:
      return 'By';
  }
}

/** Shows count episodes (a podcast has no seasons). */
export function hasEpisodes(kind: MediaKind): boolean {
  return kind === 'Series' || kind === 'Podcast';
}

/** "Page 120 of 320 · 200 to go", "Page 40", or null before the first page. */
export function pagesText(
  item: Pick<MediaItem, 'currentPage' | 'totalPages' | 'status'>,
): string | null {
  if (item.status === 'Finished' || item.currentPage === 0) {
    return item.totalPages ? `${item.totalPages} pages` : null;
  }
  if (!item.totalPages) {
    return `Page ${item.currentPage}`;
  }
  return `Page ${item.currentPage} of ${item.totalPages} · ${item.totalPages - item.currentPage} to go`;
}

/** "S2 · E4", "E37" (a podcast), or null before the first episode. */
export function episodeText(item: Pick<MediaItem, 'season' | 'episode'>): string | null {
  if (item.episode === null || item.episode === 0) {
    return item.season ? `Season ${item.season}` : null;
  }
  return item.season ? `S${item.season} · E${item.episode}` : `E${item.episode}`;
}

/** Where an item stands in words: pages for a book, the episode for a show, nothing for the rest. */
export function progressText(
  item: Pick<MediaItem, 'kind' | 'currentPage' | 'totalPages' | 'status' | 'season' | 'episode'>,
): string | null {
  if (item.kind === 'Book') {
    return pagesText(item);
  }
  return hasEpisodes(item.kind) ? episodeText(item) : null;
}

export type BacklogGroupKey = 'InProgress' | 'UpNext' | 'Want' | 'Finished' | 'Dropped';

export const BACKLOG_GROUP_LABELS: Record<BacklogGroupKey, string> = {
  InProgress: 'In progress',
  UpNext: 'Up next',
  Want: 'On the list',
  Finished: 'Finished',
  Dropped: 'Dropped',
};

/**
 * The backlog in its sections: in progress, up next, the rest of the list, finished (newest first), dropped —
 * empty sections left out. Items keep the API's order within a section.
 */
export function groupBacklog<T extends Pick<MediaItem, 'status' | 'upNext' | 'finishedOn'>>(
  items: readonly T[],
): { key: BacklogGroupKey; items: T[] }[] {
  const keyOf = (item: T): BacklogGroupKey =>
    item.status === 'Want' ? (item.upNext ? 'UpNext' : 'Want') : item.status;
  const order: BacklogGroupKey[] = ['InProgress', 'UpNext', 'Want', 'Finished', 'Dropped'];
  return order
    .map((key) => {
      const group = items.filter((item) => keyOf(item) === key);
      if (key === 'Finished') {
        group.sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
      }
      return { key, items: group };
    })
    .filter((group) => group.items.length > 0);
}

/** "★★★★☆" for a rating. */
export function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

/**
 * Reads a captured idea like "Watch Severance" or "want to read Dune" as a kind and a title for the media editor;
 * anything else keeps its text as the title and no kind.
 */
export function guessFromIdea(text: string): { kind?: MediaKind; title: string } {
  const trimmed = text.trim();
  const match = /^(?:want to |to )?(watch|read|play|listen to|hear)\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return { title: trimmed };
  }
  const verb = match[1].toLowerCase();
  const kind: MediaKind =
    verb === 'read' ? 'Book' : verb === 'play' ? 'Game' : verb === 'watch' ? 'Film' : 'Album';
  return { kind, title: match[2].trim() };
}
