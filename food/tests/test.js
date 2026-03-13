/**
 * food tests — unit tests run offline, integration tests hit live APIs.
 * node --test test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChipotleAPI, DominosAPI, DominosAuth, DominosItem, DominosMenu, DominosOrder,
  DominosPayment, DominosTracker, McDonaldsAPI, PizzaHutAPI, StarbucksAPI, TacoBellAPI, detectCardType,
} from './food.js';

// ─── UNIT TESTS (offline, no API calls) ─────────────────────────────────────

describe('detectCardType', () => {
  it('detects Visa', () => assert.equal(detectCardType('4111111111111111'), 'VISA'));
  it('detects Mastercard', () => assert.equal(detectCardType('5500000000000004'), 'MASTERCARD'));
  it('detects Amex', () => assert.equal(detectCardType('340000000000009'), 'AMEX'));
  it('detects Discover', () => assert.equal(detectCardType('6011000000000004'), 'DISCOVER'));
  it('strips non-digits', () => assert.equal(detectCardType('4111-1111-1111-1111'), 'VISA'));
  it('returns null for invalid', () => assert.equal(detectCardType('0000000000000000'), null));
  it('returns null for empty', () => assert.equal(detectCardType(''), null));
  it('returns null for short number', () => assert.equal(detectCardType('411'), null));
});

describe('DominosItem', () => {
  it('creates with defaults', () => {
    const item = new DominosItem('14SCREEN');
    assert.equal(item.Code, '14SCREEN');
    assert.equal(item.Qty, 1);
    assert.deepEqual(item.Options, {});
    assert.equal(item.isNew, true);
  });

  it('adds toppings with chaining', () => {
    const item = new DominosItem('14SCREEN').addTopping('P').addTopping('K', '1/2', '2');
    assert.deepEqual(item.Options.P, { '1/1': '1' });
    assert.deepEqual(item.Options.K, { '1/2': '2' });
  });

  it('formatted returns plain object', () => {
    const f = new DominosItem('X', 3, { P: {} }).formatted;
    assert.equal(f.Code, 'X');
    assert.equal(f.Qty, 3);
    assert.equal(f.isNew, true);
  });
});

describe('DominosPayment', () => {
  it('creates valid Visa payment', () => {
    const p = new DominosPayment({ number: '4111111111111111', expiration: '12/28', cvv: '123', postalCode: 'V3A1B2' });
    assert.equal(p.CardType, 'VISA');
    assert.equal(p.Number, '4111111111111111');
    assert.equal(p.Expiration, '1228');
    assert.equal(p.SecurityCode, '123');
    assert.equal(p.Type, 'CreditCard');
  });

  it('throws on invalid card number', () => {
    assert.throws(() => new DominosPayment({ number: '0000', expiration: '12/28', cvv: '123', postalCode: 'V3A' }), /Unrecognized card/);
  });

  it('strips dashes from card number', () => {
    const p = new DominosPayment({ number: '5500-0000-0000-0004', expiration: '01/30', cvv: '456', postalCode: 'V3A' });
    assert.equal(p.CardType, 'MASTERCARD');
    assert.equal(p.Number, '5500000000000004');
  });
});

describe('DominosOrder (offline)', () => {
  it('throws on place() without store', async () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.data.Products = [{ Code: 'X' }];
    order.data.Payments = [{ Type: 'CreditCard' }];
    order.data.Address.Region = 'BC';
    order.data.StoreID = '';
    await assert.rejects(() => order.place(), /Store ID required/);
  });

  it('throws on place() without items', async () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.data.StoreID = '10090';
    order.data.Payments = [{ Type: 'CreditCard' }];
    order.data.Address.Region = 'BC';
    await assert.rejects(() => order.place(), /No items in order/);
  });

  it('throws on place() without payment', async () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.data.StoreID = '10090';
    order.data.Products = [{ Code: 'X' }];
    order.data.Address.Region = 'BC';
    await assert.rejects(() => order.place(), /Payment required/);
  });

  it('throws on place() without address region', async () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.data.StoreID = '10090';
    order.data.Products = [{ Code: 'X' }];
    order.data.Payments = [{ Type: 'CreditCard' }];
    await assert.rejects(() => order.place(), /Address region required/);
  });

  it('sets address with chaining', () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    const ret = order.setAddress({ street: '123 Main', city: 'Langley', region: 'BC', postalCode: 'V3A1B2' });
    assert.equal(ret, order);
    assert.equal(order.data.Address.Street, '123 Main');
    assert.equal(order.data.Address.Type, 'House');
  });

  it('sets customer info', () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.setCustomer({ firstName: 'Josh', lastName: 'T', email: 'x@y.com', phone: '1234567890' });
    assert.equal(order.data.FirstName, 'Josh');
    assert.equal(order.data.Phone, '1234567890');
  });

  it('throws on orderInFuture with past date', () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    assert.throws(() => order.orderInFuture(new Date('2020-01-01')), /Date must be future/);
  });

  it('orderNow clears future time', () => {
    const order = new DominosOrder('https://order.dominos.ca', 'ca');
    order.data.FutureOrderTime = '2030-01-01';
    order.orderNow();
    assert.equal(order.data.FutureOrderTime, undefined);
  });

  it('sets correct SourceOrganizationURI per region', () => {
    const ca = new DominosOrder('https://order.dominos.ca', 'ca');
    const us = new DominosOrder('https://order.dominos.com', 'us');
    assert.equal(ca.data.SourceOrganizationURI, 'order.dominos.ca');
    assert.equal(us.data.SourceOrganizationURI, 'order.dominos.com');
  });
});

describe('DominosTracker.parseXml', () => {
  it('parses valid tracker XML', () => {
    const xml = '<AsOf>2026-03-06</AsOf><OrderStatus><StoreID>10090</StoreID><OrderID>abc</OrderID><StartTime>12:00</StartTime></OrderStatus>';
    const result = DominosTracker.parseXml(xml);
    assert.equal(result.AsOf, '2026-03-06');
    assert.equal(result.OrderStatuses.length, 1);
    assert.equal(result.OrderStatuses[0].StoreID, '10090');
    assert.equal(result.OrderStatuses[0].OrderID, 'abc');
    assert.equal(result.OrderStatuses[0].StartTime, '12:00');
  });

  it('handles empty XML', () => {
    const result = DominosTracker.parseXml('');
    assert.equal(result.AsOf, null);
    assert.deepEqual(result.OrderStatuses, []);
  });

  it('handles multiple orders', () => {
    const xml = '<OrderStatus><OrderID>1</OrderID></OrderStatus><OrderStatus><OrderID>2</OrderID></OrderStatus>';
    const result = DominosTracker.parseXml(xml);
    assert.equal(result.OrderStatuses.length, 2);
    assert.equal(result.OrderStatuses[0].OrderID, '1');
    assert.equal(result.OrderStatuses[1].OrderID, '2');
  });
});

describe('DominosTracker.parseStage', () => {
  it('maps known stages', () => {
    assert.equal(DominosTracker.parseStage({ RouteModuleStatus: 'OrdPlaced' }).stage, 'Order Placed');
    assert.equal(DominosTracker.parseStage({ RouteModuleStatus: 'Oven' }).stage, 'Bake');
    assert.equal(DominosTracker.parseStage({ RouteModuleStatus: 'Complete' }).stage, 'Delivered');
  });

  it('defaults to index 0 for unknown', () => {
    assert.equal(DominosTracker.parseStage({ RouteModuleStatus: 'Unknown' }).index, 0);
    assert.equal(DominosTracker.parseStage(null).index, 0);
    assert.equal(DominosTracker.parseStage(undefined).index, 0);
  });
});

describe('DominosAuth.decodeJwtPayload', () => {
  it('decodes valid JWT payload', () => {
    const payload = { CustomerID: '12345', sub: 'test' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const jwt = `header.${encoded}.sig`;
    const result = DominosAuth.decodeJwtPayload(jwt);
    assert.equal(result.CustomerID, '12345');
  });

  it('returns empty object for invalid JWT', () => {
    assert.deepEqual(DominosAuth.decodeJwtPayload('not-a-jwt'), {});
    assert.deepEqual(DominosAuth.decodeJwtPayload(''), {});
    assert.deepEqual(DominosAuth.decodeJwtPayload(null), {});
  });
});

describe('DominosAPI constructor', () => {
  it('creates CA region by default', () => {
    const api = new DominosAPI();
    assert.equal(api.region, 'ca');
    assert.ok(api.stores);
    assert.ok(api.menu);
    assert.ok(api.tracker);
    assert.equal(api.auth, null);
  });

  it('creates US region', () => {
    const api = new DominosAPI({ region: 'us' });
    assert.equal(api.region, 'us');
  });

  it('throws on unknown region', () => {
    assert.throws(() => new DominosAPI({ region: 'uk' }), /Unknown region/);
  });

  it('creates auth when credentials provided', () => {
    const api = new DominosAPI({ email: 'a@b.com', password: 'pass' });
    assert.ok(api.auth);
  });

  it('throws on login without credentials', async () => {
    const api = new DominosAPI();
    await assert.rejects(() => api.login(), /No credentials provided/);
  });

  it('throws on checkLoyalty without credentials', async () => {
    const api = new DominosAPI();
    await assert.rejects(() => api.checkLoyalty(), /No credentials provided/);
  });
});

describe('StarbucksAPI (offline)', () => {
  it('throws on login without credentials', async () => {
    const api = new StarbucksAPI();
    await assert.rejects(() => api.login('user', 'pass'), /Call setCredentials/);
  });

  it('throws on authed request without token', async () => {
    const api = new StarbucksAPI();
    await assert.rejects(() => api.cards(), /Not authenticated/);
  });

  it('setCredentials chains', () => {
    const api = new StarbucksAPI();
    const ret = api.setCredentials('id', 'secret');
    assert.equal(ret, api);
    assert.equal(api.clientId, 'id');
  });

  it('setToken chains', () => {
    const api = new StarbucksAPI();
    const ret = api.setToken('tok');
    assert.equal(ret, api);
    assert.equal(api.accessToken, 'tok');
  });
});

describe('ChipotleAPI (offline)', () => {
  it('constructs with correct baseUrl', () => {
    const api = new ChipotleAPI();
    assert.equal(api.baseUrl, 'https://www.chipotle.com');
  });

  it('has all expected methods', () => {
    const api = new ChipotleAPI();
    const expected = ['searchRestaurants', 'getMenu', 'getRestaurant', 'createOrder',
      'addMealToOrder', 'submitOrder', 'getPickupTimes', 'getDeliveryEstimate',
      'getOrder', 'addDeliveryInfo'];
    for (const m of expected) {
      assert.equal(typeof api[m], 'function', `Missing method: ${m}`);
    }
  });
});

describe('McDonaldsAPI constructor', () => {
  it('defaults to CA market', () => {
    const api = new McDonaldsAPI();
    assert.equal(api.market, 'CA');
    assert.equal(api.language, 'en');
  });
});

describe('TacoBellAPI (offline)', () => {
  it('constructs with correct baseUrl', () => {
    const api = new TacoBellAPI();
    assert.equal(api.baseUrl, 'https://www.tacobell.com');
  });

  it('has all expected methods', () => {
    const api = new TacoBellAPI();
    const expected = [
      'searchLocations', 'getLocation', 'getLocationHours', 'getLocationMenu',
      'getMenu', 'getMenuItems', 'getMenuItem',
      'createCart', 'getCart', 'addItemToCart', 'updateCartItem', 'removeCartItem', 'applyPromoCode',
      'checkout', 'submitOrder', 'getOrder',
      'getDeliveryEstimate', 'getPromotions',
    ];
    for (const m of expected) {
      assert.equal(typeof api[m], 'function', `Missing method: ${m}`);
    }
  });
});

describe('PizzaHutAPI (offline)', () => {
  it('constructs with correct baseUrl', () => {
    const api = new PizzaHutAPI();
    assert.equal(api.baseUrl, 'https://quikorder.pizzahut.com/phorders3/service.php');
    assert.equal(api.sessionToken, null);
  });

  it('accepts session token in constructor', () => {
    const api = new PizzaHutAPI({ sessionToken: 'abc123' });
    assert.equal(api.sessionToken, 'abc123');
  });

  it('has all expected methods', () => {
    const api = new PizzaHutAPI();
    const expected = [
      'generateSession', 'searchStores', 'getMenu', 'getMenuSection',
      'startOrder', 'addItemToOrder', 'submitOrder', 'getOrder',
    ];
    for (const m of expected) {
      assert.equal(typeof api[m], 'function', `Missing method: ${m}`);
    }
  });

  it('throws on startOrder without session', async () => {
    const api = new PizzaHutAPI();
    await assert.rejects(() => api.startOrder('12345'), /No session token/);
  });

  it('throws on addItemToOrder without session', async () => {
    const api = new PizzaHutAPI();
    await assert.rejects(() => api.addItemToOrder('12345', {}), /No session token/);
  });

  it('throws on submitOrder without session', async () => {
    const api = new PizzaHutAPI();
    await assert.rejects(() => api.submitOrder('12345', {}), /No session token/);
  });

  it('throws on getOrder without session', async () => {
    const api = new PizzaHutAPI();
    await assert.rejects(() => api.getOrder('12345'), /No session token/);
  });
});

// ─── INTEGRATION TESTS (hit live APIs, run sparingly) ────────────────────────
// Set RUN_INTEGRATION=1 to run these. Skipped by default.

const integration = process.env.RUN_INTEGRATION ? describe : describe.skip;

integration('Dominos', () => {
  const api = new DominosAPI({ region: 'ca' });

  it('finds stores near Langley', async () => {
    const stores = await api.stores.find(process.env.USER_STREET + ', ' + process.env.USER_CITY + ', ' + process.env.USER_REGION);
    assert.ok(stores.length > 0, 'Expected at least one store');
    console.log('Nearest store:', stores[0].StoreID, stores[0].AddressDescription);
  });

  it('fetches menu for store 10090', async () => {
    const menu = await api.menu.get('10090');
    assert.ok(menu.Products, 'Expected Products in menu');
    const cats = DominosMenu.getCategories(menu);
    console.log('Categories:', cats.slice(0, 3));
  });

  it('tracks by phone', async () => {
    const result = await api.tracker.byPhone(process.env.USER_PHONE);
    assert.ok(result.OrderStatuses !== undefined);
    console.log('Tracker result:', result);
  });
});

integration('Dominos Auth + Loyalty', () => {
  let api;

  it('logs in and checks loyalty points', async () => {
    api = new DominosAPI({
      region: 'ca',
      email: process.env.DOMINOS_EMAIL,
      password: process.env.DOMINOS_PASSWORD,
    });
    await api.login();
    assert.ok(api.auth.accessToken, 'Expected access token');
    assert.ok(api.auth.customerId, 'Expected customer ID');

    const status = await api.loyaltyStatus();
    assert.ok(typeof status.points === 'number', 'Expected numeric points');
    console.log(`Loyalty: ${status.points}/${status.threshold} points (${status.remaining} to free pizza)`);
    if (status.coupons.length) console.log('Available coupons:', status.coupons);
  });

  it('creates authenticated order with CustomerID', () => {
    assert.ok(api, 'Login test must pass first');
    const order = api.createOrder();
    assert.ok(order.data.CustomerID, 'Expected CustomerID on order');
    assert.ok(order.auth?.accessToken, 'Expected auth passed to order');
    console.log('Order CustomerID:', order.data.CustomerID);
  });
});

integration("McDonald's", () => {
  const mcd = new McDonaldsAPI();

  it('fetches categories', async () => {
    const cats = await mcd.categories();
    assert.ok(cats.length > 0, 'Expected categories');
    console.log('Categories:', cats.map(c => c.name).slice(0, 5));
  });

  it('searches for Big Mac', async () => {
    const results = await mcd.search('Big Mac');
    console.log('Big Mac results:', results.slice(0, 3));
  });
});

integration('Taco Bell', () => {
  const api = new TacoBellAPI();

  it('searches locations near lat/lng', async () => {
    const result = await api.searchLocations(49.1, -122.8);
    assert.ok(result, 'Expected location search result');
    console.log('Taco Bell search result:', JSON.stringify(result).slice(0, 200));
  });

  it('fetches menu', async () => {
    const menu = await api.getMenu();
    assert.ok(menu, 'Expected menu payload');
    console.log('Taco Bell menu keys:', Object.keys(menu));
  });
});

integration('Pizza Hut', () => {
  const api = new PizzaHutAPI();

  it('searches stores by zip', async () => {
    const result = await api.searchStores('V3A');
    assert.ok(result, 'Expected store search result');
    console.log('Pizza Hut search result:', JSON.stringify(result).slice(0, 200));
  });

  it('generates session and fetches menu', async () => {
    const session = await api.generateSession({
      street_address: '123 Main St', city: 'Langley', state: 'BC', zip: 'V3A1B2',
    });
    assert.ok(api.sessionToken || session, 'Expected session data');
    console.log('Pizza Hut session:', JSON.stringify(session).slice(0, 200));
  });
});

integration('Chipotle', () => {
  const api = new ChipotleAPI();
  let restaurants;

  it('searches restaurants near lat/lng', async () => {
    const result = await api.searchRestaurants(49.1, -122.8);
    restaurants = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    assert.ok(restaurants.length > 0, 'Expected at least one Chipotle restaurant');
    console.log('Nearest Chipotle:', restaurants[0]?.restaurantNumber ?? restaurants[0]?.restaurantId ?? restaurants[0]?.id);
  });

  it('fetches menu for a searched store', async () => {
    assert.ok(restaurants?.length, 'Search test must pass first');
    const storeId = restaurants[0]?.restaurantNumber ?? restaurants[0]?.restaurantId ?? restaurants[0]?.id;
    assert.ok(storeId, 'Expected store id from Chipotle search result');
    const menu = await api.getMenu(storeId);
    assert.ok(menu, 'Expected menu payload');
  });
});
