# Starbot - Starbucks API

Unofficial Starbucks API wrapper for Node.js. Find stores, check card balance, reload, and order.

## Quick Start

```javascript
import { StarbotAPI } from './starbot.js';

const api = new StarbotAPI();

// Find nearby stores
const stores = await api.stores('20690 40 Ave, Langley, BC');
console.log(stores);

// Check card balance
const balance = await api.cardBalance('1234567890123456', '1234');
console.log('Balance:', balance.balance, 'Rewards:', balance.rewards);

// Reload card
const reload = await api.reload('1234567890123456', 25.00, { type: 'CreditCard' });
console.log('New balance:', reload.newBalance);
```

## API Reference

| Method | Description |
|--------|-------------|
| `stores(address, limit?)` | Find nearby Starbucks locations |
| `cardBalance(cardNumber, pin)` | Check Starbucks card balance + rewards |
| `reload(cardNumber, amount, payment)` | Reload card with funds |
| `menu(storeId)` | Get store menu |

## CLI

```bash
starbot stores "123 Main St"
starbot balance --card 1234567890123456 --pin 1234
starbot reload --card 1234567890123456 --amount 25
starbot nearby
```

## Features

- **Store Locator** - Find closest Starbucks with distance, hours, features
- **Card Management** - Check balance, view rewards, reload
- **Mobile Order** - Place orders for pickup (coming soon)
- **Rewards Tracking** - Stars earned, free drinks available

## OpenClaw Integration

Use via OpenClaw:
- "Find nearby Starbucks"
- "Check my Starbucks card balance"
- "Reload my Starbucks card with $25"
- "Order a grande latte from Starbucks"

## Notes

- Unofficial API - uses reverse-engineered Starbucks endpoints
- Requires Starbucks account for card/order features
- Mobile order requires store to be open and accepting orders
