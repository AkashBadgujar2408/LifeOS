import { highlightParts, moveActive } from './search-text';

describe('highlightParts', () => {
  it('marks every case-insensitive occurrence, keeping the original casing', () => {
    expect(highlightParts('Visit Japan, then japan again', 'JAPAN')).toEqual([
      { text: 'Visit ', match: false },
      { text: 'Japan', match: true },
      { text: ', then ', match: false },
      { text: 'japan', match: true },
      { text: ' again', match: false },
    ]);
  });

  it('matches the whole phrase as typed, not word by word', () => {
    expect(highlightParts('book the flights, then the book', ' the book ')).toEqual([
      { text: 'book the flights, then ', match: false },
      { text: 'the book', match: true },
    ]);
  });

  it('leaves text without a match (or an empty query) as one plain part', () => {
    expect(highlightParts('Dentist', 'gym')).toEqual([{ text: 'Dentist', match: false }]);
    expect(highlightParts('Dentist', '  ')).toEqual([{ text: 'Dentist', match: false }]);
  });
});

describe('moveActive', () => {
  it('steps through the rows and wraps at both ends', () => {
    expect(moveActive(0, 3, 1)).toBe(1);
    expect(moveActive(2, 3, 1)).toBe(0);
    expect(moveActive(0, 3, -1)).toBe(2);
    expect(moveActive(-1, 3, 1)).toBe(0);
    expect(moveActive(-1, 3, -1)).toBe(2);
  });

  it('has nothing to highlight without rows', () => {
    expect(moveActive(0, 0, 1)).toBe(-1);
  });
});
