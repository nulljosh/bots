#!/usr/bin/env node
/**
 * Callie - Phone Caller
 * Makes outbound calls via Twilio with SSML briefing
 */

const twilio = require('twilio');
const { getBriefing } = require('./briefing');
const { getConfig } = require('./config');

const VOICE = getSafeVoice(process.env.VOICE);

function getSafeVoice(voice) {
  const fallback = 'Polly.Joanna-Neural';
  if (!voice) return fallback;
  // Twilio voice names are simple identifiers like Polly.Joanna-Neural
  return /^[A-Za-z0-9._-]+$/.test(voice) ? voice : fallback;
}

/**
 * Convert briefing text for TTS (no SSML - causes Error 13520)
 * Polly Neural voices sound natural without markup
 */
function briefingToSsml(text) {
  // Just escape XML - no SSML tags at all to avoid parsing errors
  // Natural pauses will come from punctuation (periods, commas)
  const escaped = escapeXml(text);
  
  // Replace newlines with periods for natural pauses
  const withPauses = escaped.replace(/\n\n+/g, '. ');
  const final = withPauses.replace(/\n/g, '. ');
  
  return final;
}

/**
 * Make a phone call with the daily briefing
 */
async function callWithBriefing(toNumber) {
  const config = getConfig();
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);

  const briefing = await getBriefing();

  // Build chunks (Twilio ~4096 char limit per <Say>)
  // No <speak> wrapper — Polly voices work with plain <Say> + inline SSML tags
  const chunks = chunkText(briefingToSsml(briefing), 3500);
  const sayElements = chunks
    .map(chunk => `<Say voice="${VOICE}">${chunk}</Say><Pause length="1"/>`)
    .join('\n');

  const twiml = `<Response>\n${sayElements}\n</Response>`;
  console.log('TwiML:', twiml.substring(0, 200), '...');

  try {
    const callOpts = {
      from: config.twilio.phoneNumber,
      to: toNumber || config.yourPhone,
      twiml: twiml,
      machineDetection: 'Enable',
      asyncAmd: true,  // Boolean, not string!
      asyncAmdStatusCallback: config.statusCallback || undefined
    };

    // Status callback for call lifecycle events
    if (config.statusCallback) {
      callOpts.statusCallback = config.statusCallback;
      callOpts.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
    }

    // Remove undefined keys
    Object.keys(callOpts).forEach(k => callOpts[k] === undefined && delete callOpts[k]);

    const call = await client.calls.create(callOpts);

    console.log(`Call initiated: ${call.sid}`);
    console.log(`From: ${config.twilio.phoneNumber} -> To: ${toNumber || config.yourPhone}`);
    console.log(`Voice: ${VOICE} | AMD: enabled`);
    return call;
  } catch (err) {
    console.error(`Call failed: ${err.message}`);
    throw err;
  }
}

/**
 * Split text into chunks under maxLen characters
 */
function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxLen) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

/**
 * Escape XML special characters for TwiML/SSML
 * Also normalize smart quotes and special characters
 */
function escapeXml(text) {
  return text
    // Normalize smart quotes and special chars first
    .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes → straight
    .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes → straight
    .replace(/[\u2013\u2014]/g, '-')  // En/em dashes → hyphen
    .replace(/\u2026/g, '...')        // Ellipsis → three dots
    // Then escape XML special characters
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Make a phone call with arbitrary text
 */
async function callWithText(text, toNumber) {
  const config = getConfig();
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);

  const escaped = escapeXml(text);
  const chunks = chunkText(escaped, 3500);
  const sayElements = chunks
    .map(chunk => `<Say voice="${VOICE}">${chunk}</Say><Pause length="1"/>`)
    .join('\n');

  const twiml = `<Response>\n${sayElements}\n</Response>`;
  console.log('TwiML:', twiml.substring(0, 200), '...');

  try {
    const call = await client.calls.create({
      from: config.twilio.phoneNumber,
      to: toNumber || config.yourPhone,
      twiml: twiml,
      machineDetection: 'Enable',
      asyncAmd: 'true'
    });

    console.log(`Call initiated: ${call.sid}`);
    console.log(`Voice: ${VOICE} | Text length: ${text.length} chars, ${chunks.length} chunk(s)`);
    return call;
  } catch (err) {
    console.error(`Call failed: ${err.message}`);
    throw err;
  }
}

/**
 * Make an interactive call using ConversationRelay + Claude
 * Requires conversation-server.js to be running and PUBLIC_URL set in .env
 */
async function callInteractive(toNumber) {
  const config = getConfig();
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  const publicUrl = process.env.PUBLIC_URL;

  if (!publicUrl) {
    throw new Error('PUBLIC_URL not set in .env — run ngrok first: ngrok http 5050');
  }

  const webhookUrl = `${publicUrl}/outbound-call`;
  console.log(`Starting interactive call via ${webhookUrl}`);

  const call = await client.calls.create({
    from: config.twilio.phoneNumber,
    to: toNumber || config.yourPhone,
    url: webhookUrl,
    method: 'POST',
    machineDetection: 'Enable',
    asyncAmd: true
  });

  console.log(`Interactive call initiated: ${call.sid}`);
  console.log(`Answer your phone — you'll be talking to Claude.`);
  return call;
}

async function fetchCallStatus(callSid) {
  const config = getConfig();
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return client.calls(callSid).fetch();
}

async function waitForCallCompletion(callSid, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 180000;
  const intervalMs = opts.intervalMs ?? 5000;
  const finalStatuses = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

  const start = Date.now();
  const timeline = [];
  let lastStatus = null;

  while (Date.now() - start < timeoutMs) {
    const call = await fetchCallStatus(callSid);

    if (call.status !== lastStatus) {
      const point = {
        at: new Date().toISOString(),
        status: call.status,
        duration: call.duration,
        answeredBy: call.answeredBy || null,
        to: call.to,
        from: call.from
      };
      timeline.push(point);
      lastStatus = call.status;
      console.log(`[status] ${point.at} -> ${point.status} (duration=${point.duration || 'n/a'}s, answeredBy=${point.answeredBy || 'n/a'})`);
    }

    if (finalStatuses.has(call.status)) {
      return { final: call, timeline };
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  const final = await fetchCallStatus(callSid);
  return { final, timeline, timedOut: true };
}

module.exports = {
  callWithBriefing,
  callWithText,
  callInteractive,
  fetchCallStatus,
  waitForCallCompletion,
  escapeXml,
  briefingToSsml,
  chunkText,
  getSafeVoice
};

// Run standalone
if (require.main === module) {
  const toNumber = process.argv[2];
  callWithBriefing(toNumber)
    .then(() => console.log('Done'))
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
