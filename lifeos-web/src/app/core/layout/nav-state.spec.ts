import type { NavGroup } from './nav-items';
import { groupForUrl, matchPages } from './nav-state';

const groups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'My Day', route: '/', icon: 'bi-sun', exact: true },
      { label: 'Reports', route: '/reports', icon: 'bi-graph-up' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Accounts', route: '/finance', icon: 'bi-bank', exact: true },
      { label: 'Net worth', route: '/finance/net-worth', icon: 'bi-graph-up-arrow' },
      { label: 'Loans', route: '/finance/loans', icon: 'bi-bank2' },
      { label: 'Money reports', route: '/finance/reports', icon: 'bi-bar-chart' },
    ],
  },
  {
    label: 'Wellbeing',
    items: [
      { label: 'Health', route: '/health', icon: 'bi-heart-pulse', exact: true },
      { label: 'Sleep', route: '/health/sleep', icon: 'bi-moon-stars' },
    ],
  },
];

describe('nav-state', () => {
  it('finds the group of the page you are on, sub-pages included', () => {
    expect(groupForUrl(groups, '/')).toBe('Overview');
    expect(groupForUrl(groups, '/finance')).toBe('Money');
    expect(groupForUrl(groups, '/finance/loans/7?tab=payments')).toBe('Money');
    expect(groupForUrl(groups, '/reports/year/2026')).toBe('Overview');
    expect(groupForUrl(groups, '/health/sleep')).toBe('Wellbeing');
    // Exact entries don't claim sub-pages, and pages outside the nav have no group.
    expect(groupForUrl(groups, '/settings')).toBeNull();
  });

  it('matches pages by the start of any word, names first', () => {
    expect(matchPages(groups, 'net').map((p) => p.label)).toEqual(['Net worth']);
    expect(matchPages(groups, 'LOANS').map((p) => p.route)).toEqual(['/finance/loans']);
    // "reports" starts Reports' name, and a word of Money reports'.
    expect(matchPages(groups, 'reports').map((p) => p.label)).toEqual(['Reports', 'Money reports']);
    // A group's name finds its pages, after any page named that way.
    expect(matchPages(groups, 'money').map((p) => p.label)).toEqual([
      'Money reports',
      'Accounts',
      'Net worth',
      'Loans',
    ]);
    // Every word has to match somewhere.
    expect(matchPages(groups, 'money sleep')).toEqual([]);
    expect(matchPages(groups, 'wellbeing sleep').map((p) => p.label)).toEqual(['Sleep']);
  });

  it('ignores the middle of words and empty queries, and caps the list', () => {
    expect(matchPages(groups, 'orth')).toEqual([]);
    expect(matchPages(groups, '   ')).toEqual([]);
    expect(matchPages(groups, 'money', 2)).toHaveLength(2);
  });
});
