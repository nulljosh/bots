<div align="center">
  <img src="icon.svg" width="120" />
  <h1>bots</h1>
</div>

Monorepo for service automation bots.

## Subprojects

| Project | Description | Language |
|---------|-------------|----------|
| **fony** | AI phone calls via Twilio | Node.js |
| **foodie** | Master food bot — Dominos ordering, Starbucks store finder, McDonald's menu lookup | Node.js |

## License

MIT 2026, Joshua Trommel

## Food Points Tracking

Unified loyalty points tracker for food services:

```bash
# Check all balances
node food-points.js status

# Integration with bots
const { FoodPoints } = require('./food-points');
const points = new FoodPoints();
await points.getAllBalances();
```

### Supported Services
- ✅ Dominos (60 points = free pizza)
- 🚧 Starbucks (150 stars = free drink)
- 🚧 More coming...

### TODO
- [ ] Real Dominos API integration
- [ ] Starbucks API (needs mobile app intercept)
- [ ] Auto-check on order placement
- [ ] Notifications when rewards available
- [ ] Integrate with existing dominos.js
