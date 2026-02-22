#!/usr/bin/env node
const twilio = require('twilio');
const { getConfig } = require('./src/config');

const config = getConfig();
const client = twilio(config.twilio.accountSid, config.twilio.authToken);

const callSid = process.argv[2] || 'CAdce43d7d74cb77a677b898100644c06f';

client.calls(callSid)
  .notifications
  .list()
  .then(notifications => {
    console.log('=== CALL NOTIFICATIONS ===');
    if (notifications.length === 0) {
      console.log('No notifications found');
    } else {
      notifications.forEach(notif => {
        console.log('\nLog Level:', notif.logLevel);
        console.log('Error Code:', notif.errorCode);
        console.log('Message:', notif.messageText);
        console.log('Request URL:', notif.requestUrl);
        console.log('Request Variables:', notif.requestVariables);
      });
    }
  })
  .catch(err => {
    console.error('Failed to fetch notifications:', err.message);
  });
