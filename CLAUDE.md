# bots
v1.1.0
## Rules
- All chain classes live in food/food.js -- do not split
- Store, address, payment loaded from food/.env
- Default Dominos order: Large hand tossed (14SCREEN), pepperoni (P) + bacon (K), garlic dip (GARBUTTER)
- Starbucks ordering blocked (needs mitmproxy credential intercept)
- No emojis
## Run
```bash
node food/food.js <command>       # usual, place, menu, track, stores, loyalty, coupons, store-deals, profile
node weedbot/weedbot.js
node --test weedbot/test.js       # 40 subprocess-based tests
```
## Key Files
- food/food.js: Food ordering chain classes and command handling
- weedbot/weedbot.js: Product tracker and checkout automation entry point
- weedbot/test.js: Subprocess-based weedbot tests
