#!/usr/bin/env node
const twilio = require('twilio');
const { getConfig } = require('./src/config');

const config = getConfig();
const client = twilio(config.twilio.accountSid, config.twilio.authToken);

const callSid = process.argv[2] || 'CAdce43d7d74cb77a677b898100644c06f';

client.calls(callSid)
  .fetch()
  .then(call => {
    console.log('=== CALL STATUS ===');
    console.log('SID:', call.sid);
    console.log('Status:', call.status);
    console.log('Duration:', call.duration, 'seconds');
    console.log('Price:', call.price, call.priceUnit);
    if (call.errorCode) {
      console.log('\n=== ERROR ===');
      console.log('Error Code:', call.errorCode);
      console.log('Error Message:', call.errorMessage);
    }
  })
  .catch(err => {
    console.error('Failed to fetch call:', err.message);
  });
