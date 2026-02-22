# Dominos Pizza API

Single-file library (`dominos.js`), zero runtime dependencies. US + Canada.

## What Works
- Store finder (by address, delivery or carryout)
- Store profiles
- Full menu with search and category filtering
- Coupon lookup
- Order builder (address, customer, products, coupons)
- Order validation and pricing (hits real API)
- Order placement (needs real payment info)
- Order tracking by phone or order key
- Tracker polling with callback

## Usage

```javascript
import { DominosAPI } from './dominos.js';
const api = new DominosAPI({ region: 'ca' });

// Find stores
const stores = await api.stores.find('20690 40 Ave, Langley, BC');

// Menu
const menu = await api.menu.get(stores[0].StoreID);

// Search menu
import { Menu } from './dominos.js';
Menu.searchItems(menu, 'pepperoni');

// Track order
const status = await api.tracker.byPhone('6045342277');

// Build + place order
const order = api.createOrder()
  .setAddress({ street: '20690 40 Ave', city: 'Langley', region: 'BC', postalCode: 'V3A2X7' })
  .setStore(stores[0].StoreID)
  .setCustomer({ firstName: 'Josh', lastName: 'T', email: 'j@t.com', phone: '7788462726' })
  .addProduct('14SCREEN');

const priced = await order.price();
// await order.place({ number, cardType, expiration, cvv, postalCode });
```

## Files
- `dominos.js` — the library (DominosAPI, StoreFinder, Menu, Tracker, Order)
- `test.js` — integration tests (hits live API, run sparingly)
- `index.html` — landing page

## Notes
- No auth needed for store/menu/tracker
- Tracker returns XML, parsed internally
- Tracker may block cloud IPs (works locally)
- Rate limits unknown, be conservative
