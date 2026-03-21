![bots](icon.svg)
# bots
![version](https://img.shields.io/badge/version-v1.1.0-blue)
Monorepo for service automation bots.
## Features
- fony: AI phone calls via Twilio
- food: Unified food ordering API (Dominos, McDonald's, Chipotle, Taco Bell, Pizza Hut, Firehouse Subs, Dairy Queen, Starbucks store finder)
- weedbot: Product tracker + checkout automation for greenlandbotanicals.cc (7 categories, Puppeteer, WooCommerce)
## Run
```bash
# food
node food/food.js usual|place|menu|track|stores|loyalty|coupons|store-deals|profile

# weedbot
node weedbot/weedbot.js
node --test weedbot/test.js
```
## Roadmap
- [ ] Notifications when rewards available
- [ ] Scheduled/recurring orders
- [ ] Order history and favorites
## Changelog
- v1.1.0: fony AI phone calls via Twilio; food unified ordering API across supported chains; weedbot product tracker and checkout automation
## License
MIT 2026 Joshua Trommel
