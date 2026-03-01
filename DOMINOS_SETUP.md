# Dominos Integration Setup

## What Was Built

Complete Dominos pizza ordering handler for the foodie bot:

1. **DominosAPI** (`src/dominos.js`) — Real Dominos API integration
   - Order creation with custom toppings
   - Menu fetching
   - Order pricing
   - Order placement with payment
   - Order tracking via tracker.dominos.com

2. **DominosOrderParser** (`src/dominos.js`) — Natural language parsing
   - "usual" → Josh's default (14" pepperoni+bacon+garlic dip)
   - "pepperoni bacon" → Custom pizza
   - "14 veggie" → Size + toppings
   - Location auto-detection (Langley store 10090)

3. **DominosSmsNotifier** (`src/dominos-sms.js`) — SMS tracking
   - Order confirmation messages
   - Real-time status polling
   - Delivery notifications
   - Callback hooks for SMS providers

4. **OpenClaw Integration** (`src/openclaw-handler.js`)
   - `/food dominos usual` — Quick order
   - `/food dominos pepperoni bacon` — Custom
   - `/food status tracker` — Show tracking URL

5. **SMS Handler Orchestration** (`src/sms-handler.js`)
   - Multi-restaurant support (Chipotle + Dominos)
   - Auto-detection by keywords
   - Payment integration
   - Callback notifications

## Configuration

### Josh's Usual Order
```
Size: 14" hand-tossed (14SCREEN)
Toppings: Pepperoni (P) + Bacon (K)
Sauce: Garlic (X)
Sides: Garlic dip (GARBUTTER)
Store: 10090 (Langley, BC)
Address: 20690 40 Ave, Langley, BC V3A 9X2
Phone: 7788462726
```

### Environment Variables Needed
```bash
# In ~/.openclaw/.secure/payment.env or similar
CARD_NUMBER=5xxx xxxx xxxx xxxx (Mastercard, encrypted)
CARD_EXP=MM/YY
CARD_CVV=xxx
CARD_POSTAL=V3A9X2
```

## Quick Test

```bash
cd ~/Documents/Code/bots/foodie
node test-dominos.js
```

Expected output:
```
=== Dominos Integration Test ===

Test 1: Order Parsing
Usual: { intent: 'usual', size: '14SCREEN', toppings: [...], ... }
Custom: { intent: 'custom', size: '14SCREEN', toppings: [...], ... }
✓ Parsing works

Test 2: OpenClaw Handler
Handler result: { status: 'ready_for_payment', restaurant: 'Dominos', ... }
✓ Handler works

Test 3: Tracking
Track URL: https://tracker.dominos.com?phone=7788462726
✓ Tracking ready

=== All tests passed ===
```

## Integration Points

### OpenClaw Channel Handler
The `/food` command routes to `OpenClawFoodHandler.execute()`:
```javascript
// In your openclaw-handler setup:
const handler = new OpenClawFoodHandler({
  region: 'ca',
  store: 10090,
  phone: '7788462726'
});

// User types: /food dominos pepperoni bacon
// System calls: handler.execute(['dominos', 'pepperoni', 'bacon'])
// Returns: { status, restaurant, total, eta, ... }
```

### SMS Notifications
Register SMS callback:
```javascript
const foodHandler = new FoodOrderHandler();

foodHandler.onSms((type, data) => {
  if (type === 'sms') {
    // Send via Twilio, AWS SNS, etc.
    sendSMS(data.to, data.message);
  }
});

// Order confirmation & tracking starts automatically
await foodHandler.handleDominos('usual');
```

### Tracking
Orders can be tracked via:
- URL: `https://tracker.dominos.com?phone=7788462726`
- API: `api.trackOrder('7788462726')`
- SMS polling: Auto-starts after order placement

## Code Patterns (match existing foodie style)

1. **Parser classes** split concern from API
   ```javascript
   const parsed = DominosOrderParser.parse(commandStr);
   const result = await api.createOrder(parsed);
   ```

2. **Callbacks for notifications**
   ```javascript
   handler.onNotify(callback).onSms(callback);
   ```

3. **Success/error pattern**
   ```javascript
   return { success: true, ...data } || { success: false, error: msg };
   ```

4. **Store as context** (not passed to every function)
   ```javascript
   this.defaultStore = options.defaultStore || 10090;
   ```

## Next Steps (Optional)

- [ ] PCI-DSS compliance for card storage
- [ ] Schedule recurring orders ("every Friday")
- [ ] Order history & favorites
- [ ] Multi-location support (stores list)
- [ ] Coupons & promotions
- [ ] Delivery time predictions (ML)
- [ ] Integration with Things 3 (create task on delivery)

## Files Changed

```
foodie/
├── src/
│   ├── dominos.js              ← NEW: API + Parser
│   ├── dominos-sms.js          ← NEW: Notifications
│   ├── openclaw-handler.js     ← UPDATED: /food dominos command
│   ├── sms-handler.js          ← UPDATED: Multi-restaurant
│   ├── chipotle.js             (unchanged)
│   └── tacobell.js             (unchanged)
├── test-dominos.js             ← NEW: Integration test
├── README.md                   ← UPDATED: Docs
└── package.json                (no changes, dominos already installed)
```

## Commit

```
2f4d040 feat(foodie): Add Dominos pizza ordering with SMS tracking
        - DominosAPI integration
        - Order parser & defaults
        - OpenClaw handler command
        - SMS notifications & tracking
        - Documentation & test
```

Shipped to: https://github.com/heyitsmejosh/bots

---

Ready to order pizza via iMessage! 🍕
