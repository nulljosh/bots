# foodbot — Agent Notes

Merged from `dominos/` and `starbot/`. Single module: `foodbot.js`.

## Architecture

Three classes, one file:
- `DominosAPI` — full ordering pipeline (CA + US), no auth needed
- `StarbucksAPI` — needs client_id/secret from mitmproxy intercept of Starbucks Android app
- `McDonaldsAPI` — menu lookup only (CA), no auth, no ordering

## Josh's Dominos Config
- Store: 10090 (4061 200 St, Langley)
- Address: 20690 40 Ave, Langley, BC V3A2X7
- Usual: 14SCREEN + P (pepperoni) + K (bacon) + X (sauce) + C (cheese), GARBUTTER (garlic dip)
- Phone: 7788462726
- Payment: see ~/.openclaw/.secure/payment.env (Mastercard ending 0255)
- Customer: Joshua Trommel, jatrommel@gmail.com

## Ordering Flow (Dominos)
1. `api.stores.find(address)` → get StoreID
2. `api.createOrder().setAddress().setStore().setCustomer().addProduct()`
3. `order.validate()` → confirm no errors
4. `order.price()` → get total
5. Confirm with Josh, then `order.setPayment().place()`

## McDonald's Notes
- Uses unofficial mcdonalds.com/ca JSON endpoints
- Categories endpoint sometimes returns empty — retry once
- No ordering API. Don't try to implement it without a stable endpoint.

## Starbucks Notes
- Status: blocked on API credentials
- Need: client_id + client_secret from Starbucks Android app intercept (mitmproxy)
- storesByAddress() works without auth (public BFF endpoint)

## Testing
Run sparingly — hits live APIs. Don't spam order.price() or place() in testing.
