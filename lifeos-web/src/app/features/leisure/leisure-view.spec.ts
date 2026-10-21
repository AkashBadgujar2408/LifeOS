import {
  episodeText,
  groupBacklog,
  guessFromIdea,
  pagesText,
  progressText,
  statusLabel,
} from './leisure-view';

describe('pagesText', () => {
  it('reads progress through a book', () => {
    expect(pagesText({ status: 'InProgress', currentPage: 120, totalPages: 320 })).toBe(
      'Page 120 of 320 · 200 to go',
    );
    expect(pagesText({ status: 'InProgress', currentPage: 40, totalPages: null })).toBe('Page 40');
    expect(pagesText({ status: 'Want', currentPage: 0, totalPages: 320 })).toBe('320 pages');
    expect(pagesText({ status: 'Finished', currentPage: 320, totalPages: 320 })).toBe('320 pages');
    expect(pagesText({ status: 'Want', currentPage: 0, totalPages: null })).toBeNull();
  });
});

describe('episodeText / progressText', () => {
  it('reads a show by season and episode, a podcast by episode', () => {
    expect(episodeText({ season: 2, episode: 4 })).toBe('S2 · E4');
    expect(episodeText({ season: null, episode: 37 })).toBe('E37');
    expect(episodeText({ season: 3, episode: null })).toBe('Season 3');
    expect(episodeText({ season: null, episode: null })).toBeNull();
  });

  it('gives each kind its own progress and nothing for a film', () => {
    const base = {
      currentPage: 0,
      totalPages: null,
      status: 'InProgress' as const,
      season: null,
      episode: null,
    };
    expect(progressText({ ...base, kind: 'Book', currentPage: 12 })).toBe('Page 12');
    expect(progressText({ ...base, kind: 'Series', season: 1, episode: 3 })).toBe('S1 · E3');
    expect(progressText({ ...base, kind: 'Film' })).toBeNull();
  });
});

describe('statusLabel', () => {
  it('uses the verb that fits the kind', () => {
    expect(statusLabel('Book', 'InProgress')).toBe('Reading now');
    expect(statusLabel('Series', 'Want')).toBe('Want to watch');
    expect(statusLabel('Game', 'InProgress')).toBe('Playing');
    expect(statusLabel('Album', 'Finished')).toBe('Finished');
  });
});

describe('groupBacklog', () => {
  it('puts up next ahead of the rest of the list, newest finished first, and drops empty sections', () => {
    const items = [
      { id: 1, status: 'Want' as const, upNext: false, finishedOn: null },
      { id: 2, status: 'Finished' as const, upNext: false, finishedOn: '2026-01-05' },
      { id: 3, status: 'Want' as const, upNext: true, finishedOn: null },
      { id: 4, status: 'Finished' as const, upNext: false, finishedOn: '2026-09-01' },
    ];
    expect(groupBacklog(items).map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['UpNext', [3]],
      ['Want', [1]],
      ['Finished', [4, 2]],
    ]);
  });
});

describe('guessFromIdea', () => {
  it('reads the verb as a kind and keeps the rest as the title', () => {
    expect(guessFromIdea('Watch Perfect Days')).toEqual({ kind: 'Film', title: 'Perfect Days' });
    expect(guessFromIdea('want to read Dune ')).toEqual({ kind: 'Book', title: 'Dune' });
    expect(guessFromIdea('Play Hades')).toEqual({ kind: 'Game', title: 'Hades' });
    expect(guessFromIdea('listen to Blue Rev')).toEqual({ kind: 'Album', title: 'Blue Rev' });
    expect(guessFromIdea('Build a recipe tracker')).toEqual({ title: 'Build a recipe tracker' });
  });
});
