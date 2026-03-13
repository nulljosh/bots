#!/usr/bin/env node
/**
 * starbot — Starbucks automation via Puppeteer
 * Uses browser cookie session + intercepts API calls post-login
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, '.session.json');
const envPath = path.join(__dirname, '.env');

function loadEnv() {
  try {
    return Object.fromEntries(
      fs.readFileSync(envPath, 'utf8').split('\n')
        .filter(l => l.includes('='))
        .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
    );
  } catch { return {}; }
}

function saveSession(data) { fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2)); }
function loadSession() {
  try { return JSON.parse(fs.readFileSync(sessionPath, 'utf8')); }
  catch { return null; }
}

async function login() {
  const env = loadEnv();
  if (!env.SBUX_EMAIL || !env.SBUX_PASSWORD) {
    console.error('Missing SBUX_EMAIL or SBUX_PASSWORD in .env'); process.exit(1);
  }

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  let capturedData = { token: null, cookies: null, cardData: null };

  await page.setRequestInterception(true);
  page.on('request', req => {
    const auth = req.headers()['authorization'];
    if (auth?.startsWith('Bearer ') && !capturedData.token) {
      capturedData.token = auth.replace('Bearer ', '');
      console.log('Bearer token captured from request!');
    }
    req.continue();
  });

  page.on('response', async res => {
    const url = res.url();
    try {
      if (url.includes('/me/cards') || url.includes('/me/rewards') || url.includes('/me/profile')) {
        const text = await res.text().catch(() => '');
        if (text.includes('cardNumber') || text.includes('balance')) {
          capturedData.cardData = JSON.parse(text);
          console.log('Card data captured!');
        }
      }
      if (url.includes('oauth') || url.includes('token') || url.includes('login')) {
        const text = await res.text().catch(() => '');
        const match = text.match(/"access_token"\s*:\s*"([^"]+)"/);
        if (match && !capturedData.token) {
          capturedData.token = match[1];
          console.log('Token captured from response!');
        }
      }
    } catch {}
  });

  console.log('Navigating to sign-in...');
  await page.goto('https://www.starbucks.ca/account/signin', { waitUntil: 'networkidle2', timeout: 30000 });

  // Try multiple selector patterns
  const emailSelectors = ['input[type="email"]', 'input[name="email"]', '#username', 'input[autocomplete="email"]'];
  const passSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];

  let emailFilled = false;
  for (const sel of emailSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel);
      await page.type(sel, env.SBUX_EMAIL, { delay: 30 });
      emailFilled = true;
      console.log(`Email filled via ${sel}`);
      break;
    } catch {}
  }

  if (!emailFilled) {
    console.error('Could not find email field. Saving screenshot.');
    await page.screenshot({ path: path.join(__dirname, 'debug.png') });
    await browser.close();
    process.exit(1);
  }

  for (const sel of passSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel);
      await page.type(sel, env.SBUX_PASSWORD, { delay: 30 });
      console.log(`Password filled via ${sel}`);
      break;
    } catch {}
  }

  const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button[class*="submit"]', 'button[class*="sign"]'];
  for (const sel of submitSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
        page.click(sel),
      ]);
      console.log(`Submitted via ${sel}`);
      break;
    } catch {}
  }

  // Wait for post-login XHR calls
  await new Promise(r => setTimeout(r, 5000));

  // Capture cookies
  const cookies = await page.cookies();
  capturedData.cookies = cookies;
  console.log(`Captured ${cookies.length} cookies`);

  // Try to navigate to account page to trigger API calls
  try {
    await page.goto('https://www.starbucks.ca/account', { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));
    const moreCookies = await page.cookies();
    capturedData.cookies = moreCookies;
  } catch {}

  await browser.close();

  capturedData.capturedAt = new Date().toISOString();
  saveSession(capturedData);

  if (capturedData.token) {
    console.log('Login successful — Bearer token saved.');
  } else if (capturedData.cookies?.length > 5) {
    console.log(`Login likely successful — ${capturedData.cookies.length} cookies saved. Will use cookie auth.`);
  } else {
    console.log('Login may have failed. Run with DEBUG=1 to see screenshot.');
  }
}

async function balance() {
  const session = loadSession();
  if (!session) { console.error('Not logged in. Run: starbot login'); process.exit(1); }

  // If we have card data from the session capture, show it
  if (session.cardData) {
    const cards = Array.isArray(session.cardData) ? session.cardData : [];
    cards.forEach(c => console.log(`${c.nickname || 'Starbucks Card'} (${c.cardNumber?.slice(-4)}): $${c.balance}`));
    return;
  }

  // Try API with Bearer token
  if (session.token) {
    const res = await fetch('https://openapi.starbucks.com/v1/me/cards', {
      headers: { 'Authorization': `Bearer ${session.token}`, 'Accept': 'application/json', 'User-Agent': 'Starbucks Android 6.48' }
    });
    if (res.ok) {
      const cards = await res.json();
      (Array.isArray(cards) ? cards : []).forEach(c => console.log(`${c.nickname || 'Card'}: $${c.balance}`));
      return;
    }
    console.log(`API returned ${res.status} — token may be expired. Re-login.`);
    return;
  }

  console.log('No token or card data in session. Try: starbot login');
}

function printUsage() {
  console.log('starbot commands:');
  console.log('  starbot login    - authenticate via browser');
  console.log('  starbot balance  - show card balance');
  console.log('  starbot debug    - show raw session data');
}

const [,, cmd] = process.argv;
switch (cmd) {
  case 'login': login().catch(console.error); break;
  case 'balance': balance().catch(console.error); break;
  case 'debug': console.log(JSON.stringify(loadSession(), null, 2)); break;
  default: printUsage();
}
