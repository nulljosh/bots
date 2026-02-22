# Callie

AI-powered daily briefing phone calls. Calls you every morning with weather, calendar, stocks, and news.

![Callie Architecture](https://nulljosh.github.io/callie/architecture.svg)

## Usage

```bash
# Call now with today's briefing (one-way TTS)
node index.js call

# Interactive call — Claude answers, you talk back
node index.js interactive

# Start conversation server only (for manual testing)
node index.js server

# Say anything (one-way TTS)
node index.js say "your text here"

# Preview briefing text (no call)
node index.js briefing

# Start scheduler (calls at 9:00 AM daily)
node index.js schedule

# Quick test call (short message)
node index.js test
```

## Setup

1. Create `.env` with Twilio credentials:
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
YOUR_PHONE=+1...
CALL_HOUR=9
CALL_MINUTE=0
```

2. Install and run:
```bash
npm install
node index.js test
```

## Tech Stack

- **Voice:** Twilio (outbound calls) + Amazon Polly Neural (Joanna-Neural TTS)
- **LLM:** Claude (claude-sonnet-4-6) → Ollama (qwen2.5:3b) fallback
- **Data:** Open-Meteo (weather), icalBuddy (calendar), Yahoo Finance (stocks), Google News RSS
- **Runtime:** Node.js

## Project Structure

```
callie/
  index.js          # CLI entry point (call/briefing/schedule/say/test)
  src/
    caller.js       # Twilio outbound call logic
    briefing.js     # Fetches weather, calendar, stocks, news; formats for TTS
    config.js       # Loads .env credentials
  .env              # Twilio creds (gitignored)
  package.json
```

## Roadmap

- [x] Phase 1: Basic test call
- [x] Phase 2: Daily briefing via TTS
- [x] Phase 3: Scheduler (9 AM daily)
- [x] Phase 4: Voicemail detection (AMD) + Neural voice + SSML
- [x] Phase 5: Interactive conversations — Claude via ConversationRelay, Ollama fallback
- [ ] Phase 6: Autonomous calling (collections, inquiries)

## Next Steps

1. **Cloudflare Tunnel** (blocks everything below)
   ```bash
   cloudflared tunnel create callie
   cloudflared tunnel route dns callie callie.yourdomain.com
   cloudflared tunnel run callie
   ```
   Add `PUBLIC_URL=https://callie.yourdomain.com` to `.env`

2. **Test interactive mode**
   ```bash
   node index.js server   # start conversation server
   node index.js interactive  # make the call
   ```

3. **Scheduler as launchd service** — so the 9am call fires without a terminal open
   ```bash
   node index.js schedule
   ```
   Wrap in a launchd plist to survive restarts.

4. **Phase 6: Autonomous calling** — outbound calls for collections, bookings, inquiries. Needs Phase 5 stable first.

---

## V1 Interactive Build Plan

**Goal:** Josh picks up the phone and has a real two-way conversation with Claude. Not a menu. Not a bot. A conversation.

### Architecture

```
OpenClaw cron (6:30 AM)
  → triggers outbound Twilio call to Josh
  → Twilio calls Josh's phone
  → Josh picks up
  → Twilio opens Media Stream WebSocket to local server
  → local server bridges audio to OpenAI Realtime API (GPT-4o)
  → OpenAI does STT + LLM response + TTS in real-time
  → audio streams back to Josh through Twilio
  → two-way conversation until hangup
```

### Reference Projects

- **[sackio/phony](https://github.com/sackio/phony)** — MCP server (TypeScript) built for Claude + Twilio + OpenAI Realtime. Claude initiates calls via tool calls. Updated Feb 2026. Closest to what we need.
- **[twilio-samples/speech-assistant-openai-realtime-api-node](https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node)** — Official Twilio sample. Clean Node.js WebSocket bridge between Twilio Media Streams and OpenAI Realtime API. Well documented, good base.

**Decision: Base on the Twilio official sample + customize.** Simpler than phony, no MCP overhead, easier to wire into OpenClaw cron directly.

### Build Steps

1. **Clone and set up base**
   ```bash
   # Already in ~/Documents/Code/callie
   npm install @fastify/websocket fastify ws
   ```

2. **Public webhook endpoint**
   ```bash
   ngrok http 5050
   # Or: cloudflared tunnel --url http://localhost:5050
   ```
   Point Twilio number Voice webhook → `https://<ngrok-url>/incoming-call`

3. **Add WebSocket bridge server** (`src/realtime-server.js`)
   - Fastify server on port 5050
   - `/incoming-call` route returns TwiML to open Media Stream
   - `/media-stream` WebSocket route bridges Twilio audio ↔ OpenAI Realtime
   - System prompt: Nick Fuentes voice, has context about Josh, morning briefing data injected

4. **Outbound call trigger** (update `src/caller.js`)
   - Instead of TTS + static TwiML, point to `/incoming-call` on the local server
   - OpenClaw cron fires at 6:30 AM → `node index.js call` → Twilio calls Josh → bridges to Realtime

5. **Inject briefing context into system prompt**
   - Before call, fetch weather + calendar + reminders
   - Pass as context to OpenAI Realtime session params
   - Claude starts the call by delivering the briefing, then takes questions

### Env additions needed
```
OPENAI_API_KEY=...        # for Realtime API
PORT=5050
PUBLIC_URL=https://...    # ngrok URL
```

### Estimated time
- Full V1 working: 1 session (~2-3 hours)
- Stretch: persistent ngrok URL so it survives restarts (ngrok paid, or Cloudflare Tunnel free)

## What You Get

**~30 second morning briefing with:**
- 🌤️ Weather (location, temp, conditions, precipitation)
- 📅 Calendar (next 3 events, deduplicated)
- 📈 Markets (S&P 500 live % change)
- 📰 News (2 top headlines)
- ⏭️ Skips empty sections (reminders, etc.)

## Recent Updates (v0.6.0)

- Swapped Groq for Claude (`claude-sonnet-4-6`) as primary LLM
- Added Ollama (`qwen2.5:3b`) as automatic fallback if Claude is unavailable
- `OLLAMA_MODEL` env var to override fallback model

## Status

**Current:** v0.6.0 - Claude primary + Ollama fallback
**Blocked:** Interactive mode needs `PUBLIC_URL` (Cloudflare Tunnel)
**Started:** 2026-02-09

## Project Map

```svg
<svg viewBox="0 0 680 420" width="680" height="420" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;background:#f8fafc;border-radius:12px">
  <rect width="680" height="420" fill="#f8fafc" rx="12"/>
  <text x="340" y="28" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e293b">callie — AI briefing phone calls</text>

  <!-- Root node -->
  <rect x="290" y="45" width="100" height="34" rx="8" fill="#0071e3"/>
  <text x="340" y="67" text-anchor="middle" font-size="11" fill="white">callie/</text>

  <!-- Dashed lines from root -->
  <line x1="340" y1="79" x2="100" y2="130" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3"/>
  <line x1="340" y1="79" x2="260" y2="130" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3"/>
  <line x1="340" y1="79" x2="420" y2="130" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3"/>
  <line x1="340" y1="79" x2="570" y2="130" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- index.js -->
  <rect x="50" y="130" width="100" height="32" rx="6" fill="#e0e7ff"/>
  <text x="100" y="147" text-anchor="middle" font-size="11" fill="#3730a3">index.js</text>
  <text x="100" y="158" text-anchor="middle" font-size="9" fill="#64748b">CLI entry</text>

  <!-- src/ folder -->
  <rect x="210" y="130" width="100" height="32" rx="6" fill="#6366f1"/>
  <text x="260" y="152" text-anchor="middle" font-size="11" fill="white">src/</text>

  <!-- scripts/ folder -->
  <rect x="370" y="130" width="100" height="32" rx="6" fill="#6366f1"/>
  <text x="420" y="152" text-anchor="middle" font-size="11" fill="white">scripts/</text>

  <!-- Config files group -->
  <rect x="520" y="130" width="110" height="32" rx="6" fill="#e0f2fe"/>
  <text x="575" y="147" text-anchor="middle" font-size="11" fill="#0369a1">package.json</text>
  <text x="575" y="158" text-anchor="middle" font-size="9" fill="#64748b">deps + scripts</text>

  <!-- src/ children -->
  <line x1="260" y1="162" x2="140" y2="220" stroke="#94a3b8" stroke-width="1"/>
  <line x1="260" y1="162" x2="260" y2="220" stroke="#94a3b8" stroke-width="1"/>
  <line x1="260" y1="162" x2="380" y2="220" stroke="#94a3b8" stroke-width="1"/>
  <line x1="260" y1="162" x2="490" y2="220" stroke="#94a3b8" stroke-width="1"/>

  <rect x="90" y="220" width="100" height="32" rx="6" fill="#e0e7ff"/>
  <text x="140" y="237" text-anchor="middle" font-size="11" fill="#3730a3">caller.js</text>
  <text x="140" y="248" text-anchor="middle" font-size="9" fill="#64748b">Twilio calls</text>

  <rect x="210" y="220" width="100" height="32" rx="6" fill="#e0e7ff"/>
  <text x="260" y="237" text-anchor="middle" font-size="11" fill="#3730a3">briefing.js</text>
  <text x="260" y="248" text-anchor="middle" font-size="9" fill="#64748b">weather/stocks/news</text>

  <rect x="330" y="220" width="100" height="32" rx="6" fill="#e0e7ff"/>
  <text x="380" y="237" text-anchor="middle" font-size="11" fill="#3730a3">config.js</text>
  <text x="380" y="248" text-anchor="middle" font-size="9" fill="#64748b">.env loader</text>

  <rect x="440" y="220" width="110" height="32" rx="6" fill="#e0e7ff"/>
  <text x="495" y="237" text-anchor="middle" font-size="11" fill="#3730a3">conversation-server.js</text>
  <text x="495" y="248" text-anchor="middle" font-size="9" fill="#64748b">interactive mode</text>

  <!-- scripts/ children -->
  <line x1="420" y1="162" x2="360" y2="320" stroke="#94a3b8" stroke-width="1"/>
  <line x1="420" y1="162" x2="490" y2="320" stroke="#94a3b8" stroke-width="1"/>

  <rect x="310" y="320" width="100" height="32" rx="6" fill="#dcfce7"/>
  <text x="360" y="337" text-anchor="middle" font-size="11" fill="#166534">check-call.js</text>
  <text x="360" y="348" text-anchor="middle" font-size="9" fill="#64748b">call status</text>

  <rect x="440" y="320" width="100" height="32" rx="6" fill="#dcfce7"/>
  <text x="490" y="337" text-anchor="middle" font-size="11" fill="#166534">check-alerts.js</text>
  <text x="490" y="348" text-anchor="middle" font-size="9" fill="#64748b">alert checks</text>

  <!-- tests/ -->
  <line x1="340" y1="79" x2="100" y2="320" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3"/>
  <rect x="50" y="320" width="90" height="32" rx="6" fill="#6366f1"/>
  <text x="95" y="342" text-anchor="middle" font-size="11" fill="white">tests/</text>

  <!-- index.html -->
  <rect x="30" y="220" width="55" height="32" rx="6" fill="#fef3c7"/>
  <text x="57" y="237" text-anchor="middle" font-size="10" fill="#92400e">index.html</text>
  <text x="57" y="248" text-anchor="middle" font-size="9" fill="#64748b">web UI</text>
  <line x1="100" y1="162" x2="57" y2="220" stroke="#94a3b8" stroke-width="1"/>

  <!-- Tech labels -->
  <text x="340" y="395" text-anchor="middle" font-size="9" fill="#64748b">Twilio · Amazon Polly Neural · Claude claude-sonnet-4-6 · Ollama fallback · Node.js</text>
</svg>
```
