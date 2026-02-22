#!/usr/bin/env node

/**
 * Callie - Test Call Script
 * Basic outbound call to verify Twilio integration works
 */

const twilio = require('twilio');

// Load credentials from OpenClaw config
const fs = require('fs');
const configPath = require('os').homedir() + '/.openclaw/openclaw.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!config.twilio) {
  console.error('❌ Twilio not configured in ~/.openclaw/openclaw.json');
  console.error('Follow SETUP.md to add credentials');
  process.exit(1);
}

const { accountSid, authToken, phoneNumber } = config.twilio;
const client = twilio(accountSid, authToken);

// Your phone number (where to call)
const YOUR_PHONE = '+17788462726';

console.log('📞 Making test call...');
console.log(`From: ${phoneNumber}`);
console.log(`To: ${YOUR_PHONE}`);

client.calls
  .create({
    from: phoneNumber,
    to: YOUR_PHONE,
    twiml: '<Response><Say voice="Polly.Matthew">Hello Joshua. This is Claude calling from your Mac mini. The Callie system is now online and working. Phase one complete.</Say></Response>'
  })
  .then(call => {
    console.log('✅ Call initiated!');
    console.log(`Call SID: ${call.sid}`);
    console.log('Check your phone - it should be ringing!');
  })
  .catch(err => {
    console.error('❌ Call failed:', err.message);
    console.error('Check SETUP.md troubleshooting section');
  });
