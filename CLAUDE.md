# bots -- Agent Notes

Monorepo for automation bots. Two active projects:

## fony
AI phone calls via Twilio. See fony/CLAUDE.md.

## food
Unified food API. Five classes in one file (food/foodbot.js):
- `DominosAPI` -- full ordering pipeline, CA + US, OAuth for rewards/profile
- `StarbucksAPI` -- store finder works; ordering needs mitmproxy credential intercept
- `McDonaldsAPI` -- menu/nutrition lookup (CA only), no ordering
- `ChipotleAPI` -- restaurant search, menu, ordering, pickup times, delivery estimates
- `TacoBellAPI` -- location search, menu, cart/ordering, delivery estimates, promotions

Default Dominos order: Large hand tossed (14SCREEN), pepperoni (P) + bacon (K), garlic dip (GARBUTTER).
Store, address, payment: loaded from .env (see food/.env.example).
OpenClaw CLI wrapper: ~/.openclaw/workspace/skills/dominos/scripts/order.js
Commands: usual, place, menu, track, stores, loyalty, coupons, store-deals, profile

Delivery config (in skill config.json):
- Instructions: "Leave at the door. Do not knock."
- Tip: $0 (hardcoded)
- CustomerID: set from OAuth login on every order
- Store coupons: pulled from menu endpoint (replaces 403ing /customer/coupons)

## Structure
bots/
├── fony/
├── food/
├── index.html    (GitHub Pages landing)
├── README.md
└── CLAUDE.md
