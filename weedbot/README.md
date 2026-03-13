![Weedbot](icon.svg)
# Weedbot
![version](https://img.shields.io/badge/version-v2.0.0-blue)

Multi-category product tracker for greenlandbotanicals.cc. CLI interface with JSON storage, Puppeteer scraping, and WooCommerce account integration.

## Categories

| Category | Unit | Subcategories |
|----------|------|---------------|
| flower | grams | indica, sativa, hybrid, pre-rolls, shake, popcorn, premium-aaaa, craft-exotics, wholesale, 99-ounces-and-under, aa |
| extracts | grams | shatter, budder, live-resin, kief, hash, sauce, oils, thc-diamonds, crumble, rosin |
| edibles | mg | gummies, chocolate, cookies, syrup |
| mushrooms | grams | dried, magic, edible, microdose, tea, tinctures |
| vapes | unit | disposable, cartridge, nicotine, battery |
| nicotine | unit | pouches, vapes, cigarettes |
| accessories | unit | pipes, health, snacks |

## Usage

```bash
# Inventory
node index.js list                              # all items by category
node index.js list flower --prices              # flower with price tables
node index.js categories                        # category summary
node index.js browse                            # show category tree
node index.js browse edibles                    # show edible subcategories
node index.js find "kush"                       # search across all categories

# Stock management
node index.js add "Blue Dream" 3.5              # add flower (default)
node index.js add "Gummies" 500 --cat edibles --sub gummies --vendor Bliss
node index.js remove "Blue Dream" 1.0           # reduce stock
node index.js use "Blue Dream"                  # log session (default 0.5g)
node index.js delete "Blue Dream"               # remove entirely

# Pricing and orders
node index.js price "OG Kush" 11                # set per-gram price
node index.js price "OG Kush" bag 3.5 28        # set bag price
node index.js order "OG Kush" 7                 # place local order

# Account (greenlandbotanicals.cc)
node index.js login                             # authenticate with .env creds
node index.js account                           # show account dashboard
node index.js orders --remote                   # fetch remote order history
node index.js browse flower --live              # scrape live listings

# Stats and history
node index.js stats                             # overall stats
node index.js stats flower                      # per-category stats
node index.js log 10                            # last 10 history entries
node index.js config session 0.3                # set session size
```

## Testing

```bash
npm test            # 40 tests, all offline, uses temp sandboxes
```

## License

MIT 2026
