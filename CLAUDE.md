# bots -- Agent Notes

Monorepo for automation bots. Two active projects:

## fony
AI phone calls via Twilio. See fony/CLAUDE.md.

## foodie
Unified food API. Three classes in one file (foodie/foodbot.js):
- `DominosAPI` -- full ordering pipeline, CA + US, OAuth for rewards/profile
- `StarbucksAPI` -- store finder works; ordering needs mitmproxy credential intercept
- `McDonaldsAPI` -- menu/nutrition lookup (CA only), no ordering

Josh's usual Dominos order: Large hand tossed (14SCREEN), pepperoni (P) + bacon (K), garlic dip (GARBUTTER).
Store: 10090 (4061 200 St, Langley). Payment: ~/.openclaw/.secure/payment.env.
OpenClaw CLI wrapper: ~/.openclaw/workspace/skills/dominos/scripts/order.js

## Structure
bots/
├── fony/
├── foodie/
├── index.html    (GitHub Pages landing)
├── README.md
└── CLAUDE.md
