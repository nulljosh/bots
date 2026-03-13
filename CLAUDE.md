# bots -- Agent Notes

Monorepo for automation bots. Two active projects:

## fony
AI phone calls via Twilio. See fony/CLAUDE.md.

## food
Unified food API. Eight classes in one file (food/food.js):
- `DominosAPI` -- full ordering pipeline, CA + US, OAuth for rewards/profile
- `StarbucksAPI` -- store finder works; ordering needs mitmproxy credential intercept
- `McDonaldsAPI` -- menu/nutrition lookup (CA only), no ordering
- `ChipotleAPI` -- restaurant search, menu, ordering, pickup times, delivery estimates
- `TacoBellAPI` -- location search, menu, cart/ordering, delivery estimates, promotions
- `PizzaHutAPI` -- store finder, menu, cart/ordering, session-based auth
- `FirehouseSubsAPI` -- RBI GraphQL store search (US only), static menu
- `DairyQueenAPI` -- store search via DQ locator API, static menu

Default Dominos order: Large hand tossed (14SCREEN), pepperoni (P) + bacon (K), garlic dip (GARBUTTER).
Store, address, payment: loaded from .env (see food/.env.example).
OpenClaw CLI wrapper: ~/.openclaw/workspace/skills/dominos/scripts/order.js
Commands: usual, place, menu, track, stores, loyalty, coupons, store-deals, profile

Delivery config (in skill config.json):
- Instructions: "Leave at the door. Do not knock."
- Tip: $0 (hardcoded)
- CustomerID: set from OAuth login on every order
- Store coupons: pulled from menu endpoint (replaces 403ing /customer/coupons)

## weedbot
Multi-category product tracker for greenlandbotanicals.cc. See weedbot/CLAUDE.md.
7 categories (flower, extracts, edibles, mushrooms, vapes, nicotine, accessories).
CLI tool with JSON storage, Puppeteer scraping for live listings, WooCommerce login for account/orders.
40 subprocess-based tests (node --test test.js).

## Structure
bots/
├── fony/
├── food/
│   ├── food.js        (all 8 chain classes)
│   ├── tests/         (test.js, test-dominos.js, health.js)
│   └── docs/
├── weedbot/
├── index.html    (GitHub Pages landing)
├── README.md
└── CLAUDE.md

## Quick Commands
- `./scripts/simplify.sh`
- `./scripts/monetize.sh . --write`
- `./scripts/audit.sh .`
- `./scripts/ship.sh .`
