# foodie

Unified food ordering API. Three services in one module (`foodbot.js`).

## Services

| Service | Status | Features |
|---------|--------|----------|
| **Dominos** | Live | Full ordering pipeline, OAuth, loyalty, store deals, tracking |
| **Starbucks** | Partial | Store finder only. Ordering blocked on API credentials |
| **McDonald's** | Partial | Menu + nutrition lookup (CA). No ordering |

## OpenClaw Integration

CLI wrapper: `~/.openclaw/workspace/skills/dominos/scripts/order.js`

```bash
node order.js usual        # Price the usual order
node order.js place        # Place order (stdin JSON)
node order.js menu <query> # Search menu
node order.js track        # Track delivery
node order.js stores <addr># Find nearby stores
node order.js loyalty      # Check points
node order.js coupons      # Loyalty + store coupons
node order.js store-deals  # Store menu deals
node order.js profile      # Account info
```

## Dominos Defaults

- Store: 10090 (Langley)
- Usual: Large hand tossed, pepperoni + bacon, 2x garlic dip
- Delivery: "Leave at the door. Do not knock.", tip $0
- Payment: Mastercard from `~/.openclaw/.secure/payment.env`

## License

MIT 2026
