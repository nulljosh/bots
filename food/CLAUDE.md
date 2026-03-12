# food — Agent Notes

Single module `food.js` — 8 chains, unified interface.

## Classes

| Class | Type | Notes |
|-------|------|-------|
| `DominosAPI` | Live ordering | Full CA+US pipeline, OAuth, loyalty, tracking |
| `StarbucksAPI` | Partial | Store search works; ordering blocked on API creds |
| `McDonaldsAPI` | Static menu | Live endpoint works; static fallback if dead |
| `ChipotleAPI` | Live ordering | Restaurant search, menu, ordering, delivery |
| `TacoBellAPI` | Live ordering | Location search, menu, cart, delivery, promos |
| `PizzaHutAPI` | Live ordering | Zip-based store search, menu, cart (quikorder API) |
| `FirehouseSubsAPI` | Static menu | Store search via RBI GraphQL (US only); ordering needs Cognito auth |
| `DairyQueenAPI` | Static menu | Store search via DQ locator API; ordering not available |

## Unified Interface (all classes)

```js
searchStores(lat, lng, radius)  // throws "Store search not available" if no public API
getMenu()                        // returns MENU object (static or live)
searchMenu(query)                // fuzzy search, returns [{name, id, category, score}]
getPrice(itemId, size)           // 'small'|'medium'|'large', returns number or null
```

## Shared Helpers (top of food.js)

- `fuzzySearchMenu(menu, query)` — token + substring scoring across all categories
- `flattenMenuItems(menu)` — flattens category map to flat array
- `readPrice(item, size)` — resolves price_size or price field
- `fetchJSON(url, options)` — fetch wrapper with error handling

## Dominos Config

- Store, address, phone, payment: from `.env` (see `.env.example`)
- Usual: `14SCREEN + P (pepperoni) + K (bacon) + X (sauce) + C (cheese), GARBUTTER`

## Dominos Ordering Flow

1. Read saved Opticon balance first (purchase guard)
2. Compute purchase percent of balance
3. Check store status when available
4. `DominosStoreFinder.find(address)` → StoreID
5. `DominosOrder.setAddress().setStore().setCustomer().addProduct()`
6. `order.price()` → get total + preflight context
7. Confirm with Josh, then `order.validate()` and `order.setPayment().place()`
8. Return a cleaner receipt + tracking context

## Starbucks

- Blocked on client_id/secret (need mitmproxy intercept of Android app)
- Store search works without auth
- Roadmap: Puppeteer balance scrape → auto-reload → Opticon financeData.js sync

## Firehouse Subs

- RBI GraphQL gateway: `use1-prod-fhs-gateway.rbictg.com/graphql`
- Store search works (US only — no Canadian stores)
- Menu: static (Sanity CMS names not accessible without Cognito auth)
- Ordering: needs `us-east-1_1GhLoww6S` Cognito pool, client `v8lmpra3vj5o89chbefeitsun`

## Health Check

```bash
node health.js  # All 7 tests should pass green
```

## Testing

Run sparingly — hits live APIs. Never spam `order.price()` or `place()`.
