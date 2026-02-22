# Fony - AI Daily Briefing Phone Calls

## Overview
Production-ready Twilio/Polly system that calls you every morning at 9 AM with a 30-second briefing covering weather, calendar, markets, and news.

## Status
- v0.6.0 - Claude primary + Ollama fallback for interactive mode
- Started: 2026-02-09
- Live: Daily calls working

## Architecture
- Voice: Twilio outbound calls + TwiML
- TTS: Amazon Polly Neural (Joanna-Neural)
- LLM: Claude (claude-sonnet-4-6) → Ollama (qwen2.5:3b) fallback
- Data: Open-Meteo, icalBuddy, Yahoo Finance, Google News RSS
- Runtime: Node.js
- GitHub Pages: https://nulljosh.github.io/fony

## Project Structure
```
fony/
  index.js              # CLI entry point
  src/
    caller.js           # Twilio call logic
    briefing.js         # Data fetching + formatting
    config.js           # Environment config
  tests/                # Test scripts
  scripts/              # Check/monitoring scripts
  .env                  # Twilio credentials (gitignored)
```

## Usage
```bash
node index.js call      # Call now
node index.js briefing  # Preview text
node index.js schedule  # Start 9 AM scheduler
node index.js test      # Quick test call
```

## Roadmap
- [x] Phase 1-4: Basic calls, briefing, scheduler, AMD + Neural voice
- [ ] Phase 5: Interactive conversations (ConversationRelay + Claude API)
- [ ] Phase 6: Autonomous calling (collections, inquiries)

## Recent Work
- Cut briefing from 63s to 30s
- Fixed all SSML/asyncAmd errors
- Added real-time stock data
- Deduplicated calendar events
- Skip empty sections

## Coding Standards
- ES6+ Node.js
- camelCase naming
- Async/await for API calls
- No SSML in TTS (causes parsing errors)
- Keep briefing under 35 seconds total
