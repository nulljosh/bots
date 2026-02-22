/**
 * Callie - Configuration
 * Loads Twilio credentials from env vars or .env file
 */

const fs = require('fs');
const path = require('path');

function getConfig() {
  // Try .env file first
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }

  const config = {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    yourPhone: process.env.YOUR_PHONE || '+17788462726',
    schedule: {
      hour: parseInt(process.env.CALL_HOUR || '8', 10),
      minute: parseInt(process.env.CALL_MINUTE || '0', 10)
    },
    statusCallback: process.env.STATUS_CALLBACK_URL || null
  };

  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.phoneNumber) {
    console.error('Missing Twilio credentials. Create a .env file with:');
    console.error('  TWILIO_ACCOUNT_SID=AC...');
    console.error('  TWILIO_AUTH_TOKEN=...');
    console.error('  TWILIO_PHONE_NUMBER=+1...');
    process.exit(1);
  }

  return config;
}

module.exports = { getConfig };
