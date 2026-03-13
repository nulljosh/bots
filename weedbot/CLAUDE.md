# weedbot -- Agent Notes

Multi-category product tracker. CLI tool, JSON storage. v2.0.0.

## Commands

| Command | Description |
|---------|-------------|
| `list [category] [--prices]` | Inventory grouped by category |
| `categories` | Local category summary with counts |
| `browse [category] [--live]` | Config tree or live scrape from greenlandbotanicals.cc |
| `stats [category]` | Summary stats, optionally per-category |
| `log [n]` | History (last n entries) |
| `find <query>` | Fuzzy search across all categories |
| `add <name> <qty> [--cat <c>] [--sub <s>] [--vendor <v>]` | Add item |
| `remove <name> <qty>` | Reduce stock |
| `use [name] [qty]` | Log session (defaults to last used item + session size) |
| `delete <name>` | Remove item entirely |
| `price <name> <$/g>` | Set per-gram price |
| `price <name> bag <g> <$>` | Set bag price |
| `order <name> <qty>` | Place local order |
| `orders [n]` | View local orders |
| `orders --remote [id]` | View remote orders from greenland account |
| `login` | Authenticate with greenland (Puppeteer + WooCommerce) |
| `account` | Show remote account dashboard |
| `config session <qty>` | Set default session size |
| `config url <url>` | Set store root URL |

## Categories

7 categories: flower, extracts, edibles, mushrooms, vapes, nicotine, accessories.
Each has subcategories defined in config.json. Units: g (flower/extracts/mushrooms), mg (edibles), unit (vapes/nicotine/accessories).

## Data Model

Items: `{ name, quantity, category, subcategory, vendor, unit, prices, dateAdded, url }`
Old items with `strain` field are auto-migrated to `name` on load with `category: "flower"`.

## Files

- `index.js` -- all CLI logic
- `scraper.js` -- Puppeteer: login, account, remote orders, live category scraping
- `config.json` -- session size, root URL, category tree
- `data.json` -- inventory + history
- `orders.json` -- local order log
- `users.json` -- auth config (requireAuth: false by default)
- `.env` -- GB_USERNAME, GB_PASSWORD (gitignored)
- `session.json` -- saved cookies after login (gitignored)
- `test.js` -- 40 CLI tests (node --test)

## Testing

```bash
node --test test.js     # 40 tests, subprocess-based, uses temp sandboxes
npm test                # same thing
```

Tests copy index.js + scraper.js into temp dirs so real data is never touched.
