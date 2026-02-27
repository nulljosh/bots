/**
 * foodbot integration tests — hits live APIs, run sparingly.
 * node --test test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DominosAPI, McDonaldsAPI } from './foodbot.js';

describe('Dominos', () => {
  const api = new DominosAPI({ region: 'ca' });

  it('finds stores near Langley', async () => {
    const stores = await api.stores.find('20690 40 Ave, Langley, BC');
    assert.ok(stores.length > 0, 'Expected at least one store');
    console.log('Nearest store:', stores[0].StoreID, stores[0].AddressDescription);
  });

  it('fetches menu for store 10090', async () => {
    const menu = await api.menu.get('10090');
    assert.ok(menu.Products, 'Expected Products in menu');
    const cats = DominosAPI.Menu?.getCategories?.(menu) ?? [];
    console.log('Categories:', cats.slice(0, 3));
  });

  it('tracks by phone', async () => {
    const result = await api.tracker.byPhone('7788462726');
    assert.ok(result.OrderStatuses !== undefined);
    console.log('Tracker result:', result);
  });
});

describe("McDonald's", () => {
  const mcd = new McDonaldsAPI();

  it('fetches categories', async () => {
    const cats = await mcd.categories();
    assert.ok(cats.length > 0, 'Expected categories');
    console.log('Categories:', cats.map(c => c.name).slice(0, 5));
  });

  it('searches for Big Mac', async () => {
    const results = await mcd.search('Big Mac');
    console.log('Big Mac results:', results.slice(0, 3));
    // May be empty if API changes — not a hard fail
  });
});
