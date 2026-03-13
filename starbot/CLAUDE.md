# Starbot

Starbucks CLI tool. Store locator, card balance, rewards tracking.

## Structure
```
starbot/
  starbot.js      # StarbotAPI class (ES module)
  package.json
```

## API
- `cardBalance(cardNumber, pin)` - Gift card balance (needs OAuth token or Puppeteer)
- `stores(address, limit)` - Store locator (needs OAuth token or Puppeteer)
- `login(email, password)` - OAuth login (stub, needs mitmproxy credentials)
- `reload(cardNumber, amount, opts)` - Card reload (stub, needs auth)

## CLI
Wrapper at `~/.openclaw/workspace/skills/starbot/starbot` (symlinked to `~/.local/bin/starbot`).
Config at `~/.openclaw/workspace/skills/starbot/config.json`.

## Status
Starbucks deprecated all public BFF endpoints (`starbucks.ca/bff/*`) circa early 2026.
All methods throw with clear error messages until one of these is implemented:
1. **OAuth token** via mitmproxy intercept of Starbucks mobile app
2. **Puppeteer scraping** of `starbucks.com/gift/check-balance` and store-locator page

## Endpoints
- OAuth (authenticated): `https://openapi.starbucks.com/v1/` (needs clientId/clientSecret from mitmproxy)
- Store locator page: `https://www.starbucks.com/store-locator` (React SPA, scrapeable)
- Balance check page: `https://www.starbucks.com/gift/check-balance` (React SPA, scrapeable)

## Test Data
- Card: `6336334400175193`, PIN: `5193`
- Expected: Balance $25.50, 120 stars
