# foodbot — Agent Notes

Merged from `dominos/` and `starbot/`. Single module: `foodbot.js`.

## Architecture

Four classes, one file:
- `DominosAPI` — full ordering pipeline (CA + US), OAuth for rewards/profile
- `StarbucksAPI` — needs client_id/secret from mitmproxy intercept of Starbucks Android app
- `McDonaldsAPI` — menu lookup only (CA), no auth, no ordering
- `ChipotleAPI` — restaurant search, menu, ordering, pickup times, delivery estimates

## Dominos Config
- Store, address, phone, payment: loaded from .env (see .env.example)
- Usual: 14SCREEN + P (pepperoni) + K (bacon) + X (sauce) + C (cheese), GARBUTTER (garlic dip)

## Ordering Flow (Dominos)
1. `api.stores.find(address)` → get StoreID
2. `api.createOrder().setAddress().setStore().setCustomer().addProduct()`
3. `order.validate()` → confirm no errors
4. `order.price()` → get total
5. Confirm with Josh, then `order.setPayment().place()`

## McDonald's Notes
- Uses unofficial mcdonalds.com/ca JSON endpoints
- Categories endpoint sometimes returns empty — retry once
- No ordering API. Don't try to implement it without a stable endpoint.

## Starbucks Notes
- Status: blocked on API credentials
- Need: client_id + client_secret from Starbucks Android app intercept (mitmproxy)
- storesByAddress() works without auth (public BFF endpoint)
- All open-source API wrappers are dead (2017 era), keys rotated, cert pinning active

### Starbucks Roadmap
- [ ] Balance check via Puppeteer scrape of app.starbucks.com (no API creds needed)
- [ ] Enable auto-reload in Starbucks app (manual, no code needed)
- [ ] Update Opticon financeData.js balance from scrape result
- [ ] (stretch) Extract fresh client_id/secret from APK via apktool if ordering is needed

## OpenClaw Skill
CLI wrapper: `~/.openclaw/workspace/skills/dominos/scripts/order.js`
Config: `~/.openclaw/workspace/skills/dominos/config.json`

Commands: usual, place, menu, track, stores, loyalty, coupons, store-deals, profile

Delivery: "Leave at the door. Do not knock.", tip $0, CustomerID from OAuth.
Store coupons via menu endpoint (the /customer/coupons and /customer/deals endpoints 403 on CA).

## Testing
Run sparingly — hits live APIs. Don't spam order.price() or place() in testing.
