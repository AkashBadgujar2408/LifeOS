import {
  filterNotes,
  isDue,
  reviewText,
  sessionSubject,
  sessionsByDay,
  studyTotals,
} from './learning-plan-view';

const TODAY = '2026-10-18'; // a Sunday

describe('reviewText + isDue', () => {
  it('reads the next review day', () => {
    expect(reviewText({ nextReviewOn: '2026-10-18' }, TODAY)).toBe('Due today');
    expect(reviewText({ nextReviewOn: '2026-10-17' }, TODAY)).toBe('Due since yesterday');
    expect(reviewText({ nextReviewOn: '2026-10-15' }, TODAY)).toBe('Due since 3 days ago');
    expect(reviewText({ nextReviewOn: '2026-10-19' }, TODAY)).toBe('Next review tomorrow');
    expect(reviewText({ nextReviewOn: '2026-10-22' }, TODAY)).toBe('Next review in 4 days');
    expect(reviewText({ nextReviewOn: null }, TODAY)).toBe('Not in review');
  });

  it('keeps a missed review due', () => {
    expect(isDue({ nextReviewOn: '2026-10-01' }, TODAY)).toBe(true);
    expect(isDue({ nextReviewOn: TODAY }, TODAY)).toBe(true);
    expect(isDue({ nextReviewOn: '2026-10-19' }, TODAY)).toBe(false);
    expect(isDue({ nextReviewOn: null }, TODAY)).toBe(false);
  });
});

describe('studyTotals', () => {
  it('sums the week from Monday and the last 30 days', () => {
    const sessions = [
      { studiedOn: '2026-10-18', minutes: 30 },
      { studiedOn: '2026-10-12', minutes: 45 }, // Monday: this week
      { studiedOn: '2026-10-11', minutes: 20 }, // Sunday before: last week
      { studiedOn: '2026-09-19', minutes: 10 }, // 30th day back
      { studiedOn: '2026-09-18', minutes: 99 }, // outside both
    ];
    expect(studyTotals(sessions, TODAY)).toEqual({ week: 75, last30: 105 });
  });
});

describe('sessionsByDay', () => {
  it('groups newest day first with a total each', () => {
    const groups = sessionsByDay([
      { studiedOn: '2026-10-17', minutes: 20 },
      { studiedOn: '2026-10-18', minutes: 30 },
      { studiedOn: '2026-10-17', minutes: 25 },
    ]);
    expect(groups.map((g) => [g.day, g.minutes, g.sessions.length])).toEqual([
      ['2026-10-18', 30, 1],
      ['2026-10-17', 45, 2],
    ]);
  });
});

describe('sessionSubject', () => {
  it('names the topic and what it was for', () => {
    const none = { topic: null, skillName: null, courseTitle: null, bookTitle: null };
    expect(sessionSubject({ ...none, topic: 'Subjunctive', skillName: 'Spanish' })).toBe(
      'Subjunctive · Spanish',
    );
    expect(sessionSubject({ ...none, courseTitle: 'Signals in depth', skillName: 'Angular' })).toBe(
      'Signals in depth',
    );
    expect(sessionSubject(none)).toBe('Something since removed');
  });
});

describe('filterNotes', () => {
  const notes = [
    {
      title: 'Ser vs estar',
      content: 'Permanent vs temporary',
      skillId: 1,
      skillName: 'Spanish',
      tags: [{ id: 7, name: 'Grammar' }],
    },
    { title: 'Signals', content: null, skillId: 2, skillName: 'Angular', tags: [] },
    {
      title: 'Stoicism',
      content: 'Control what you can',
      skillId: null,
      skillName: null,
      tags: [],
    },
  ];
  const none = { text: '', tagId: null, skillId: null };

  it('keeps everything when nothing is chosen', () => {
    expect(filterNotes(notes, none).length).toBe(3);
  });

  it('needs every word, anywhere in the note, any order and case', () => {
    expect(filterNotes(notes, { ...none, text: 'ESTAR ser' }).map((n) => n.title)).toEqual([
      'Ser vs estar',
    ]);
    expect(filterNotes(notes, { ...none, text: 'grammar temporary' }).length).toBe(1);
    expect(filterNotes(notes, { ...none, text: 'angular' }).map((n) => n.title)).toEqual([
      'Signals',
    ]);
    expect(filterNotes(notes, { ...none, text: 'signals spanish' })).toEqual([]);
  });

  it('narrows by tag and by skill', () => {
    expect(filterNotes(notes, { ...none, tagId: 7 }).length).toBe(1);
    expect(filterNotes(notes, { ...none, skillId: 2 }).map((n) => n.title)).toEqual(['Signals']);
    expect(filterNotes(notes, { ...none, skillId: 2, tagId: 7 })).toEqual([]);
  });
});
