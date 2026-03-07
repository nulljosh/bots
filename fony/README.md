# fony

AI daily briefing phone calls via Twilio.

## Status

v0.7.0 -- Live, daily calls at 9 AM.

## Stack

- **Voice**: Twilio outbound + TwiML
- **TTS**: Amazon Polly Neural (Joanna-Neural)
- **LLM**: Claude (claude-sonnet-4-6), Ollama (qwen2.5:3b) fallback
- **Data**: Open-Meteo, icalBuddy, Yahoo Finance, Google News RSS, Arthur daemon

## Usage

```bash
node index.js call      # Call now
node index.js briefing  # Preview text
node index.js schedule  # Start 9 AM scheduler
node index.js test      # Quick test call
```

## Briefing Content

30-second call covering weather, calendar, markets, news, and Arthur training status.

## License

MIT 2026
