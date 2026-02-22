const twilio = require('twilio');
const { getConfig } = require('./src/config');
const { getBriefing } = require('./src/briefing');

async function testCall() {
  const config = getConfig();
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  
  const briefing = await getBriefing();
  console.log('Briefing preview:', briefing.substring(0, 200), '...\n');
  
  const twiml = `<Response>
<Say voice="Polly.Joanna-Neural">${briefing}</Say>
</Response>`;

  console.log('Making call WITHOUT AMD and WITHOUT SSML breaks...');
  console.log('TwiML length:', twiml.length, 'bytes\n');
  
  const call = await client.calls.create({
    from: config.twilio.phoneNumber,
    to: config.yourPhone,
    twiml: twiml
    // NO machineDetection
    // NO asyncAmd
  });
  
  console.log('✅ Call initiated:', call.sid);
  console.log('This should play the RAW briefing text with no pauses');
}

testCall().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
