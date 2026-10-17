import type { NavGroup } from '../layout/nav-items';
import type { ModuleKey } from '../services/settings.service';
import { pickableLifeAreas, visibleNavGroups } from './visibility';

const groups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'My Day', route: '/', icon: 'bi-sun' },
      { label: 'Calendar', route: '/calendar', icon: 'bi-calendar3', module: 'Calendar' },
    ],
  },
  {
    label: 'Your story',
    items: [
      { label: 'Story', route: '/story', icon: 'bi-book', module: 'Story' },
      { label: 'Missions', route: '/missions', icon: 'bi-compass', module: 'Story' },
    ],
  },
];

describe('visibleNavGroups', () => {
  it('shows everything when nothing is hidden', () => {
    expect(visibleNavGroups(groups, new Set())).toEqual(groups);
  });

  it('drops hidden modules and any group they leave empty, keeping entries without a module', () => {
    const hidden = new Set<ModuleKey>(['Calendar', 'Story']);
    expect(visibleNavGroups(groups, hidden)).toEqual([
      { label: 'Overview', items: [{ label: 'My Day', route: '/', icon: 'bi-sun' }] },
    ]);
  });
});

describe('pickableLifeAreas', () => {
  const areas = [
    { id: 1, name: 'Career' },
    { id: 2, name: 'Learning' },
    { id: 3, name: 'Health' },
  ];

  it('leaves out switched-off areas', () => {
    expect(pickableLifeAreas(areas, new Set([2]), null).map((a) => a.id)).toEqual([1, 3]);
  });

  it("keeps the item's own area even when it has been switched off", () => {
    expect(pickableLifeAreas(areas, new Set([2]), 2).map((a) => a.id)).toEqual([1, 2, 3]);
  });
});
