#!/usr/bin/env node
/**
 * Callie - Interactive Conversation Server
 * Twilio ConversationRelay <-> Codex
 *
 * How it works:
 *   1. Callie makes outbound call to Josh
 *   2. Twilio hits POST /outbound-call for TwiML
 *   3. TwiML starts ConversationRelay session (Twilio handles STT + TTS)
 *   4. WebSocket /ws receives Josh's transcribed speech as text
 *   5. We send text to Codex, stream response back
 *   6. ConversationRelay speaks Claude's response to Josh
 *
 * Run:
 *   node src/conversation-server.js
 *   (needs ngrok or public URL in PUBLIC_URL env var)
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const OpenAI = require('openai');
const { execSync } = require('child_process');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const PORT = process.env.PORT || 5050;
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://xxxx.ngrok.app

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const ollama = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: OLLAMA_API_KEY });

const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.3-codex';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

// --- Briefing context fetcher (reuses briefing.js logic inline for Claude system prompt) ---
function getBriefingContext() {
  const lines = [];

  try {
    const weather = execSync("curl -s 'wttr.in/Brookswood+Langley+BC?format=3'", { timeout: 5000, encoding: 'utf8' }).trim();
    lines.push(`Weather: ${weather}`);
  } catch { lines.push('Weather: unavailable'); }

  try {
    const cal = execSync("/opt/homebrew/bin/icalBuddy -n -nc -iep 'title,datetime' eventsToday+7 2>/dev/null", { timeout: 5000, encoding: 'utf8' }).trim();
    lines.push(`Calendar (next 7 days):\n${cal || 'Nothing scheduled'}`);
  } catch { lines.push('Calendar: unavailable'); }

  try {
    const reminders = execSync('/opt/homebrew/bin/remindctl all --plain 2>/dev/null', { timeout: 5000, encoding: 'utf8' }).trim();
    // Extract just the reminder titles (last column, tab-separated)
    const titles = reminders.split('\n').map(l => l.split('\t').pop()).filter(Boolean);
    lines.push(`Reminders: ${titles.join(', ') || 'None'}`);
  } catch { lines.push('Reminders: unavailable'); }

  return lines.join('\n');
}

function toSafeWsUrl(publicUrl) {
  try {
    const parsed = new URL(publicUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSystemPrompt() {
  const context = getBriefingContext();
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return `You are Callie, Josh's AI assistant calling him on the phone. You're smart, direct, and sharp.

Current time: ${now}

Josh's context:
${context}

Rules:
- This is a PHONE CALL. Keep responses SHORT and conversational. 1-3 sentences max.
- Start the call by delivering the morning briefing concisely, then ask if he has questions.
- Answer anything he asks — weather follow-up, news, tasks, whatever.
- No markdown, no bullet points. Just natural speech.
- When Josh says goodbye/thanks/done, wrap up and end the call.`;
}

// --- Express app ---
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// TwiML endpoint — Twilio hits this when the call connects
app.post('/outbound-call', (req, res) => {
  if (!PUBLIC_URL) {
    res.status(500).send('PUBLIC_URL not set in .env');
    return;
  }

  const wsUrl = toSafeWsUrl(PUBLIC_URL);
  if (!wsUrl) {
    res.status(500).send('PUBLIC_URL is invalid');
    return;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${wsUrl}" voice="en-US-Neural2-F" transcriptionProvider="google" interruptible="true" />
  </Connect>
</Response>`;

  console.log(`[${new Date().toISOString()}] Call connected, starting ConversationRelay -> ${wsUrl}`);
  res.type('text/xml').send(twiml);
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'callie' }));

// --- WebSocket server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log(`[${new Date().toISOString()}] WebSocket connected from ${req.socket.remoteAddress}`);

  const messages = []; // conversation history for Claude
  const systemPrompt = buildSystemPrompt();
  console.log('System prompt built, context loaded.');

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    console.log(`[WS] Received:`, msg.type, msg.voicePrompt || '');

    if (msg.type === 'prompt' && msg.voicePrompt) {
      const userText = msg.voicePrompt.trim();
      if (!userText) return;

      // Add to history
      messages.push({ role: 'user', content: userText });

      try {
        let fullResponse = '';
        let usedFallback = false;

        const sendToken = (token) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'text', token }));
          }
        };

        // Primary: Codex via OpenAI API
        try {
          const codex = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const stream = await codex.chat.completions.create({
            model: CODEX_MODEL,
            max_tokens: 300,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true
          });

          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (!token) continue;
            fullResponse += token;
            sendToken(token);
          }
          console.log(`[Codex] ${CODEX_MODEL} response: ${fullResponse.substring(0, 100)}...`);
        } catch (codexErr) {
          // Fallback: Ollama
          console.warn(`[Codex] Failed (${codexErr.message}), falling back to Ollama ${OLLAMA_MODEL}`);
          usedFallback = true;
          fullResponse = '';

          const stream = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            max_tokens: 300,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true
          });

          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (!token) continue;
            fullResponse += token;
            sendToken(token);
          }
          console.log(`[Ollama] ${OLLAMA_MODEL} response: ${fullResponse.substring(0, 100)}...`);
        }

        // Signal end of response
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'text', token: '', last: true }));
        }

        messages.push({ role: 'assistant', content: fullResponse });

        // End call on goodbye
        const goodbye = /\b(goodbye|bye|take care|have a good|that's all|end the call)\b/i.test(fullResponse);
        if (goodbye && ws.readyState === ws.OPEN) {
          setTimeout(() => ws.send(JSON.stringify({ type: 'end' })), 2000);
        }

      } catch (err) {
        console.error('[LLM] Fatal error:', err.message);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'text', token: 'Sorry, I ran into an issue. Talk to you later.' }));
          ws.send(JSON.stringify({ type: 'text', token: '', last: true }));
        }
      }
    }

    if (msg.type === 'interrupt') {
      console.log('[WS] Interrupted by user');
    }

    if (msg.type === 'end') {
      console.log('[WS] Call ended');
      ws.close();
    }
  });

  ws.on('close', () => console.log(`[${new Date().toISOString()}] WebSocket closed`));
  ws.on('error', (err) => console.error('[WS] Error:', err.message));
});

server.listen(PORT, () => {
  console.log(`Callie conversation server running on port ${PORT}`);
  if (PUBLIC_URL) {
    console.log(`Public URL: ${PUBLIC_URL}`);
    console.log(`Twilio webhook: ${PUBLIC_URL}/outbound-call`);
  } else {
    console.log('WARNING: PUBLIC_URL not set. Run ngrok and set it in .env');
  }
});

module.exports = { server };
