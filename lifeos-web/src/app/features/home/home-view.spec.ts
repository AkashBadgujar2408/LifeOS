import type { Asset } from '../../core/services/home.service';
import { dueStatus, filterAssets, groupByRoom, knownRooms, runsOutStatus } from './home-view';

const asset = (id: number, name: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name,
  propertyId: 1,
  propertyName: 'Flat 4B',
  room: null,
  brand: null,
  model: null,
  serialNumber: null,
  quantity: 1,
  purchasedOn: null,
  purchasePrice: null,
  currency: null,
  disposedOn: null,
  disposalKind: null,
  disposalAmount: null,
  notes: null,
  tags: [],
  coveredUntil: null,
  ...extra,
});

describe('home view', () => {
  const today = '2026-10-20';

  it('words when something runs out', () => {
    expect(runsOutStatus('2026-11-10', today)).toEqual({
      state: 'soon',
      days: 21,
      label: 'Runs out in 21 days',
    });
    expect(runsOutStatus('2026-10-21', today).label).toBe('Runs out tomorrow');
    expect(runsOutStatus(today, today).state).toBe('today');
    expect(runsOutStatus('2026-10-17', today).label).toBe('Ran out 3 days ago');
    expect(runsOutStatus('2026-10-19', today).label).toBe('Ran out yesterday');
    expect(runsOutStatus('2027-10-20', today).state).toBe('later');
  });

  it('words when maintenance is due', () => {
    expect(dueStatus('2026-10-25', today).label).toBe('Due in 5 days');
    expect(dueStatus('2026-10-17', today)).toEqual({
      state: 'past',
      days: -3,
      label: 'Overdue by 3 days',
    });
    expect(dueStatus('2026-11-20', today).state).toBe('later');
  });

  it('groups the inventory by property and room, unplaced last, counting quantities', () => {
    const groups = groupByRoom([
      asset(1, 'Toaster', { room: 'kitchen' }),
      asset(2, 'Dining chairs', { room: 'Kitchen ', quantity: 4 }),
      asset(3, 'Laptop', { room: 'Study' }),
      asset(4, 'Drill', { room: null }),
      asset(5, 'Bike', { propertyId: null, propertyName: null, room: 'Garage' }),
      asset(6, 'Lamp', { propertyId: 2, propertyName: 'Cottage', room: 'Study' }),
    ]);
    expect(groups.map((g) => `${g.propertyName ?? '-'}/${g.room ?? '-'}:${g.count}`)).toEqual([
      'Cottage/Study:1',
      'Flat 4B/kitchen:5',
      'Flat 4B/Study:1',
      'Flat 4B/-:1',
      '-/Garage:1',
    ]);
    expect(groups[1].assets.map((a) => a.name)).toEqual(['Dining chairs', 'Toaster']);
  });

  it('suggests each room once, per property when asked', () => {
    const assets = [
      asset(1, 'A', { room: 'Kitchen' }),
      asset(2, 'B', { room: 'kitchen' }),
      asset(3, 'C', { room: 'Bedroom' }),
      asset(4, 'D', { propertyId: 2, room: 'Garage' }),
    ];
    expect(knownRooms(assets)).toEqual(['Bedroom', 'Garage', 'Kitchen']);
    expect(knownRooms(assets, 1)).toEqual(['Bedroom', 'Kitchen']);
  });

  it('filters by text in any field or tag, and by tag', () => {
    const assets = [
      asset(1, 'Fridge', {
        brand: 'LG',
        serialNumber: 'LG123',
        tags: [{ id: 7, name: 'Appliances' }],
      }),
      asset(2, 'Sofa', { room: 'Living room' }),
    ];
    expect(filterAssets(assets, 'lg1', null).map((a) => a.id)).toEqual([1]);
    expect(filterAssets(assets, 'appli', null).map((a) => a.id)).toEqual([1]);
    expect(filterAssets(assets, 'living', null).map((a) => a.id)).toEqual([2]);
    expect(filterAssets(assets, '', 7).map((a) => a.id)).toEqual([1]);
    expect(filterAssets(assets, '', null)).toHaveLength(2);
  });
});
