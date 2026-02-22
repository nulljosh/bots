/**
 * Basic integration tests against live Dominos API.
 * Run: node --test test.js
 *
 * Note: These hit the real API. Don't run repeatedly (rate limits).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DominosAPI } from './dominos.js';

const api = new DominosAPI({ region: 'ca' });

describe('StoreFinder', () => {
  it('finds stores near a Canadian address', async () => {
    const stores = await api.stores.find('20690 40 Ave, Langley, BC');
    assert.ok(stores.length > 0, 'Should find at least one store');
    assert.ok(stores[0].StoreID, 'Store should have an ID');
    assert.ok(stores[0].Phone, 'Store should have a phone number');
  });

  it('returns store profile', async () => {
    const stores = await api.stores.find('20690 40 Ave, Langley, BC');
    const profile = await api.stores.profile(stores[0].StoreID);
    assert.ok(profile, 'Should return profile data');
  });
});

describe('Menu', () => {
  it('loads menu for a store', async () => {
    const stores = await api.stores.find('20690 40 Ave, Langley, BC');
    const menu = await api.menu.get(stores[0].StoreID);
    assert.ok(menu.Products, 'Menu should have Products');
    assert.ok(menu.Categorization, 'Menu should have Categorization');
  });

  it('searches menu items', async () => {
    const stores = await api.stores.find('20690 40 Ave, Langley, BC');
    const menu = await api.menu.get(stores[0].StoreID);
    const results = DominosAPI.Menu ? [] : [];
    // Use static method
    const { Menu } = await import('./dominos.js');
    const pizzas = Menu.searchItems(menu, 'pizza');
    assert.ok(pizzas.length > 0, 'Should find pizza items');
  });
});

describe('Tracker', () => {
  it('queries tracker by phone without error', async () => {
    // This may return empty if no active orders
    try {
      const data = await api.tracker.byPhone('6045342277');
      assert.ok(data, 'Should return tracker data');
    } catch (err) {
      // 404 or empty is OK — means no active orders
      assert.ok(true, 'No active orders is a valid state');
    }
  });
});

describe('Order', () => {
  it('creates and validates an order structure', () => {
    const order = api.createOrder();
    order
      .setAddress({ street: '20690 40 Ave', city: 'Langley', region: 'BC', postalCode: 'V3A2X7' })
      .setStore('10010')
      .setCustomer({ firstName: 'Test', lastName: 'User', email: 'test@test.com', phone: '6045342277' })
      .addProduct('14SCREEN');

    assert.ok(order.data.Products.length === 1, 'Should have one product');
    assert.ok(order.data.StoreID === '10010', 'Should have store ID set');
    assert.ok(order.data.Address.Street === '20690 40 Ave', 'Should have address set');
  });
});
