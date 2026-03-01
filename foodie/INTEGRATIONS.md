# Foodie: Integration Roadmap

Current status: Dominos + Starbucks + McDonald's

## Working

✅ **Dominos** (Full Integration)
- Store finder by address
- Menu + search
- Pricing + validation
- Order placement (needs payment)
- Real-time tracker (by phone/order key)
- Status: Production-ready

✅ **Starbucks** (Mostly Working)
- Store finder
- Card balance + rewards
- Menu lookup
- Order status: Needs client credentials from app intercept (mitmproxy)

✅ **McDonald's** (Read-Only)
- Menu categories
- Full-text search
- Nutrition data
- Status: No ordering API available publicly

## To Add (Priority Order)

### High Priority (Public APIs Available)

1. **Chipotle**
   - Menu API: https://www.chipotle.com/api/menu (may be public)
   - Location API exists
   - Order: Requires auth (feasible)
   - ROI: High (popular, accessible)

2. **Taco Bell**
   - Menu: https://www.tacobell.com/api/menu (may exist)
   - Rewards program integration
   - Order: Likely requires OAuth
   - ROI: High

3. **Subway**
   - Menu API likely exists
   - Franchise-based locations
   - Order: Needs investigation
   - ROI: Medium

### Medium Priority

4. **Pizza Hut** (Competitor to Dominos)
5. **Uber Eats / DoorDash** (Meta platforms for all restaurants)
6. **Grubhub API** (Public API available)

### Low Priority (Paywall/No Public API)

- Chick-fil-A (app-only, no public API)
- In-N-Out (private, no delivery API)
- Most regional chains (no public API)

## Integration Process

For each new chain:

1. **Reconnaissance** — Find API docs, reverse-engineer if needed
2. **Auth** — Determine if auth required, how to get credentials
3. **Menu** — Build MenuAPI class (store finder, categories, items, search)
4. **Tracker** — Add order tracking (if available)
5. **Ordering** — Implement order builder + payment flow
6. **Testing** — Mock requests, test edge cases

## Effort Estimates

- **Chipotle**: 4-6 hours (good API available)
- **Taco Bell**: 4-6 hours (similar to Chipotle)
- **Subway**: 3-4 hours (simpler menu)
- **Uber Eats**: 8-10 hours (complex, many restaurants)
- **Grubhub**: 6-8 hours (public API but requires auth)

## Next Steps

1. Research Chipotle API availability (check network tab on chipotle.com)
2. Test Taco Bell API endpoints
3. Pick one, implement, test
4. Add to unified foodbot interface
5. Deploy + document

Estimated time to add 2 chains: 1-2 days

## Voice/SMS Integration (NEW)

### Goal
Text-to-order: Josh texts "chipotle burrito bowl" → order placed → pickup ready

### Flow
1. **SMS Trigger** (iMessage/Telegram)
   - "chipotle burrito bowl with chicken"
   - "taco bell: 2x crunchwrap"
   - "pickup chipotle near langley"

2. **AI Parser** (Samantha)
   - Extract restaurant + items + quantity + mods
   - Confirm price + ETA before placing

3. **Auto-Order** (foodbot)
   - Find nearest location
   - Build order with cart
   - Place with saved payment
   - Get pickup time

4. **Notification**
   - "✓ Chipotle order placed. Ready in 15 min at Langley location. Pickup code: 8472"
   - Real-time status updates

### Implementation Priority
1. **Chipotle API** (4-6h) — lowest friction, popular
2. **SMS Parser** (2-3h) — item extraction, confirmation flow
3. **Pickup Tracker** (1-2h) — polling ready status
4. **Notification System** (1h) — callback to iMessage

### Why This Works
- Josh orders 2-3x/week (high frequency = high ROI)
- Hands-free (text while driving/working)
- Faster than app (no UI navigation)
- Repeatable commands ("taco bell usual" = saved cart)

### Tech Stack
- **Parser:** Claude (extract intent, items, quantity)
- **Ordering:** foodbot.ChipotleAPI
- **Tracker:** foodbot polling + webhook callback
- **Notification:** OpenClaw message tool

### Estimated Effort
- Chipotle API: 4-6h
- SMS→Order pipeline: 3-4h
- Parser + notifications: 2-3h
- **Total: 9-13h (1-2 days)**

### MVP (Viable in 1 day)
1. Chipotle menu + ordering
2. Text "order chipotle: bowl with chicken, barbacoa, guac"
3. System confirms price, places order
4. Pickup notification sent

### Phase 2 (Week 2)
- "chipotle usual" = saved cart recall
- Scheduled orders ("chipotle in 2 hours")
- Loyalty integration
- Taco Bell + Subway

