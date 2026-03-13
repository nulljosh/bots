![bots](icon.svg)

# bots

![version](https://img.shields.io/badge/version-v1.1.0-blue)

Monorepo for service automation bots.

## Architecture

![Architecture](architecture.svg)

## Subprojects

| Project | Description | Language |
|---------|-------------|----------|
| **fony** | AI phone calls via Twilio | Node.js |
| **food** | Unified food API -- 7 working chains + Starbucks (blocked): Dominos, McDonald's, Chipotle, Taco Bell, Pizza Hut, Firehouse Subs, Dairy Queen | Node.js |
| **starbucks** | Starbucks ordering bot (~~non-functional~~ -- needs mitmproxy credential intercept) | Node.js |
| **weedbot** | Multi-category product tracker for greenlandbotanicals.cc -- 7 categories, Puppeteer scraping, WooCommerce checkout automation + account integration | Node.js |

## Roadmap

- [x] Dominos API integration (ordering, tracking, menu, store finder)
- [x] Dominos OAuth (rewards, profile)
- [x] OpenClaw CLI integration (order.js)
- [x] Starbucks store finder (public BFF endpoint)
- [x] McDonald's menu + nutrition lookup
- [x] Chipotle ordering (restaurant search, menu, ordering, pickup times)
- [x] Taco Bell ordering (location search, menu, cart, delivery estimates)
- [x] Pizza Hut ordering (store finder, menu, cart, session-based auth)
- [x] Firehouse Subs (RBI GraphQL store search, static menu)
- [x] Dairy Queen (store search, static menu)
- [x] Weedbot remote checkout automation (WooCommerce)
- [x] Weedbot confirmation page scraping
- [x] Weedbot legacy strain field removal
- [ ] ~~Starbucks ordering (needs mitmproxy credential intercept)~~
- [x] Loyalty points + coupons tracking
- [x] Store deals from menu endpoint
- [x] Delivery instructions + tip config
- [ ] Notifications when rewards available
- [ ] Scheduled/recurring orders
- [ ] Order history and favorites

## License

MIT 2026

## Quick Commands
- `./scripts/simplify.sh` - normalize project structure
- `./scripts/monetize.sh . --write` - generate monetization plan (if available)
- `./scripts/audit.sh .` - run fast project audit (if available)
- `./scripts/ship.sh .` - run checks and ship (if available)
