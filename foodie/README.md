# foodbot

Master food bot. One module to rule Dominos, Starbucks, and McDonald's.

Merged from `dominos/` and `starbot/`. McDonald's menu lookup added.

## What Works

### Dominos (CA + US)
- Store finder by address
- Full menu with search + category filtering
- Coupon lookup
- Order builder — address, customer, products, coupons, payment
- Order validation and pricing (live API)
- Order placement (needs real payment info)
- Order tracking by phone or order key
- Tracker polling with callback

### Starbucks (CA)
- Store finder by address or lat/lng
- Card balance + rewards
- Last order + reorder cart
- Order pricing + placement
- Status: needs client_id/client_secret from Starbucks app (mitmproxy intercept)

### McDonald's (CA)
- Menu categories
- Menu items by category
- Full-text menu search
- Nutrition lookup by item ID
- Status: menu lookup only, no ordering

## Usage

```javascript
import { DominosAPI, StarbucksAPI, McDonaldsAPI } from './foodbot.js';

// --- Dominos ---
const dominos = new DominosAPI({ region: 'ca' });
const stores = await dominos.stores.find('20690 40 Ave, Langley, BC');
const menu = await dominos.menu.get(stores[0].StoreID);
const status = await dominos.tracker.byPhone('7788462726');

const order = dominos.createOrder()
  .setAddress({ street: '20690 40 Ave', city: 'Langley', region: 'BC', postalCode: 'V3A2X7' })
  .setStore(stores[0].StoreID)
  .setCustomer({ firstName: 'Josh', lastName: 'T', email: 'j@t.com', phone: '7788462726' })
  .addProduct('14SCREEN');

const priced = await order.price();
// await order.setPayment({ number, expiration, cvv, postalCode }).place();

// --- Starbucks ---
const sbux = new StarbucksAPI();
sbux.setCredentials(clientId, clientSecret); // from mitmproxy intercept
await sbux.login(username, password);
const sbuxStores = await sbux.storesByAddress('Langley, BC');
const balance = await sbux.cards();

// --- McDonald's ---
const mcd = new McDonaldsAPI();
const cats = await mcd.categories();
const burgers = await mcd.menuByCategory(cats[0].id);
const bigMac = await mcd.search('Big Mac');
const nutrition = await mcd.nutrition(bigMac[0].id);
```

## Files

- `foodbot.js` — unified module (DominosAPI, StarbucksAPI, McDonaldsAPI)
- `test.js` — integration tests
- `CLAUDE.md` — agent notes

## Notes

- Dominos: no auth needed for store/menu/tracker
- Starbucks: ordering needs auth — get credentials from Starbucks Android app via mitmproxy
- McDonald's: menu/nutrition only, no ordering API available

## OpenClaw /food Commands

```
/food chipotle bowl:chicken guac
  → "✓ Order placed. Pickup code: 847263. Ready in 15 min."

/food chipotle burrito:carnitas rice:brown salsa:hot
  → Burrito with carnitas, brown rice, hot salsa

/food dominos pizza location:langley
  → Order Dominos pizza to Langley location

/food status 847263
  → Check pickup order status

/food menu chipotle
  → Show Chipotle menu items
```

### How It Works

1. **Command parsing** — `/food [restaurant] [order spec]`
2. **Intent extraction** — "bowl:chicken guac" → { type: 'bowl', protein: 'chicken', hasGuac: true }
3. **Store lookup** — Find nearest location
4. **Order build** — Add items, pricing
5. **Confirmation** → Place with saved payment
6. **Pickup notification** → "Ready in 15 min. Code: 847263"

### Integration with OpenClaw

foodie is wired to OpenClaw command system. Add to your OpenClaw config:

```yaml
commands:
  - name: food
    handler: bots/foodie/src/openclaw-handler.js
    description: Text-to-order for Chipotle, Dominos, etc.
```

Then text or message: `/food chipotle bowl:chicken`

