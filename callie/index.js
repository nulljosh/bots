#!/usr/bin/env node
/**
 * Callie - AI-powered daily briefing phone calls
 *
 * Usage:
 *   node index.js call          # Call now with today's briefing
 *   node index.js briefing      # Preview briefing text (no call)
 *   node index.js schedule      # Start scheduler (calls at 8:00 AM daily)
 *   node index.js test          # Test call with short message
 *   node index.js debug [to] [text]  # Place call and poll Twilio status to final state
 */

const { execSync } = require('child_process');
const { callWithBriefing, callWithText, callInteractive, waitForCallCompletion } = require('./src/caller');
const { getBriefing } = require('./src/briefing');
const { getConfig } = require('./src/config');

const command = process.argv[2] || 'call';

function notifyFailure(err) {
  const msg = `Callie failed to call: ${err.message}`;
  try {
    execSync(`/opt/homebrew/bin/imsg send --to +17788462726 --text ${JSON.stringify(msg)}`, { timeout: 10000 });
  } catch (imsgErr) {
    console.error('iMessage notification also failed:', imsgErr.message);
  }
}

switch (command) {
  case 'call':
    console.log('Calling with daily briefing...');
    callWithBriefing()
      .then(() => console.log('Call initiated successfully'))
      .catch(err => {
        console.error('Failed:', err.message);
        notifyFailure(err);
        process.exit(1);
      });
    break;

  case 'briefing':
    getBriefing().then(b => console.log(b));
    break;

  case 'schedule': {
    const config = getConfig();
    const { hour, minute } = config.schedule;
    console.log(`Scheduler started. Will call at ${hour}:${String(minute).padStart(2, '0')} daily.`);
    console.log('Press Ctrl+C to stop.\n');

    function scheduleNext() {
      const now = new Date();
      const next = new Date();
      next.setHours(hour, minute, 0, 0);

      // If we've already passed today's time, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      const msUntil = next - now;
      const hoursUntil = (msUntil / 3600000).toFixed(1);
      console.log(`Next call in ${hoursUntil} hours (${next.toLocaleString()})`);

      setTimeout(async () => {
        try {
          console.log(`[${new Date().toLocaleString()}] Making daily briefing call...`);
          await callWithBriefing();
          console.log('Call completed.');
        } catch (err) {
          console.error('Call failed:', err.message);
          notifyFailure(err);
        }
        scheduleNext();
      }, msUntil);
    }

    scheduleNext();
    break;
  }

  case 'say': {
    const text = process.argv.slice(3).join(' ');
    if (!text) {
      console.error('Usage: node index.js say "your text here"');
      process.exit(1);
    }
    console.log(`Calling with custom text (${text.length} chars)...`);
    callWithText(text)
      .then(() => console.log('Call initiated successfully'))
      .catch(err => {
        console.error('Failed:', err.message);
        process.exit(1);
      });
    break;
  }

  case 'test': {
    const twilio = require('twilio');
    const config = getConfig();
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);

    client.calls.create({
      from: config.twilio.phoneNumber,
      to: config.yourPhone,
      twiml: '<Response><Say voice="Polly.Matthew-Neural">Hello Joshua. This is Callie. Your daily briefing system is online and working. Test complete.</Say></Response>'
    })
    .then(call => console.log(`Test call initiated: ${call.sid}`))
    .catch(err => console.error('Test failed:', err.message));
    break;
  }

  case 'server':
    // Start the conversation server (keep running for interactive calls)
    require('./src/conversation-server');
    break;

  case 'interactive': {
    // Start server + make interactive call immediately
    require('./src/conversation-server');
    const toNumber = process.argv[3];
    setTimeout(() => {
      callInteractive(toNumber)
        .then(() => console.log('Pick up your phone — Claude is calling.'))
        .catch(err => { console.error('Failed:', err.message); process.exit(1); });
    }, 1000); // give server 1s to start
    break;
  }

  case 'debug': {
    const toNumber = process.argv[3];
    const text = process.argv.slice(4).join(' ') ||
      'Debug call from Callie. If you hear this, pick up and hang up so we can verify call status logging.';

    console.log('Placing debug call...');
    callWithText(text, toNumber)
      .then(async (call) => {
        console.log(`Debug call SID: ${call.sid}`);
        console.log('Polling Twilio status until final state...');
        const result = await waitForCallCompletion(call.sid, { timeoutMs: 180000, intervalMs: 5000 });

        const final = result.final;
        console.log('\n=== DEBUG RESULT ===');
        console.log(`SID: ${final.sid}`);
        console.log(`From: ${final.from}`);
        console.log(`To: ${final.to}`);
        console.log(`Status: ${final.status}`);
        console.log(`Duration: ${final.duration || 0}s`);
        console.log(`AnsweredBy: ${final.answeredBy || 'unknown'}`);
        if (result.timedOut) {
          console.log('Note: timed out waiting for final state; last known status shown above.');
        }
        console.log('====================\n');
      })
      .catch(err => {
        console.error('Debug call failed:', err.message);
        process.exit(1);
      });
    break;
  }

  default:
    console.log('Usage: node index.js [call|briefing|schedule|say|test|server|interactive|debug]');
}
