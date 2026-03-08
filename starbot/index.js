#!/usr/bin/env node
/**
 * starbot — Starbucks automation via Puppeteer
 * Approach: real browser session, intercept XHR/fetch calls to extract auth token
 * No mitmproxy, no APK needed.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenPath = path.join(__dirname, '.token.json');
const envPath = path.join(__dirname, '.env');

// Load credentials from .env
function loadEnv() {
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const [k, ...v] = line.split('=');
      if (k && v.length) env[k.trim()] = v.join('=').trim();
    }
    return env;
  } catch {
    return {};
  }
}

function saveToken(data) {
  fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2));
}

function loadToken() {
  try { return JSON.parse(fs.readFileSync(tokenPath, 'utf8')); }
  catch { return null; }
}

async function login() {
  const env = loadEnv();
  if (!env.SBUX_EMAIL || !env.SBUX_PASSWORD) {
    console.error('Missing SBUX_EMAIL or SBUX_PASSWORD in starbot/.env');
    process.exit(1);
  }

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  let capturedToken = null;

  // Intercept all requests — watch for Bearer tokens
  await page.setRequestInterception(true);
  page.on('request', req => {
    const auth = req.headers()['authorization'];
    if (auth && auth.startsWith('Bearer ') && !capturedToken) {
      capturedToken = auth.replace('Bearer ', '');
      console.log('Captured auth token!');
    }
    req.continue();
  });

  // Also intercept responses for token in body
  page.on('response', async res => {
    if (capturedToken) return;
    try {
      const url = res.url();
      if (url.includes('oauth/token') || url.includes('login') || url.includes('auth')) {
        const text = await res.text().catch(() => '');
        const match = text.match(/"access_token"\s*:\s*"([^"]+)"/);
        if (match) {
          capturedToken = match[1];
          console.log('Captured token from response body!');
        }
      }
    } catch {}
  });

  console.log('Navigating to Starbucks login...');
  await page.goto('https://www.starbucks.ca/account/signin', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  console.log('Filling credentials...');
  await page.waitForSelector('input[type="email"], input[name="email"], #username', { timeout: 10000 });
  await page.type('input[type="email"], input[name="email"], #username', env.SBUX_EMAIL, { delay: 50 });
  await page.type('input[type="password"], input[name="password"], #password', env.SBUX_PASSWORD, { delay: 50 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"], .form__button'),
  ]);

  // Wait for any XHR calls that might carry the token
  await page.waitForTimeout(3000);

  await browser.close();

  if (capturedToken) {
    const tokenData = { token: capturedToken, capturedAt: new Date().toISOString() };
    saveToken(tokenData);
    console.log('Token saved to .token.json');
    return tokenData;
  } else {
    console.log('No token captured. Starbucks may use httpOnly cookies.');
    console.log('Try running with headless: false to inspect manually.');
    return null;
  }
}

async function balance() {
  const token = loadToken();
  if (!token) { console.error('Not logged in. Run: starbot login'); process.exit(1); }
  const res = await fetch('https://openapi.starbucks.com/v1/me/cards', {
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Accept': 'application/json',
      'User-Agent': 'Starbucks Android 6.48',
      'X-Api-Key': token.clientId || '',
    }
  });
  if (!res.ok) { console.error(`API error: ${res.status}`); process.exit(1); }
  const cards = await res.json();
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) { console.log('No cards found.'); return; }
  list.forEach(c => console.log(`- ${c.nickname || c.cardNumber}: $${c.balance}`));
}

async function stores(query = 'Langley BC') {
  const url = `https://www.starbucks.ca/bff/locations?lat=49.1&lng=-122.4&mop=true&radius=5`;
  // This endpoint needs browser cookies — use puppeteer
  const token = loadToken();
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...(token ? { 'Authorization': `Bearer ${token.token}` } : {}),
    }
  });
  if (!res.ok) { console.log(`Store locator returned ${res.status} — may need browser session`); return; }
  const data = await res.json();
  (data.stores || []).slice(0, 5).forEach(s => console.log(`- ${s.name}: ${s.address?.streetAddressLine1}`));
}

function printUsage() {
  console.log('starbot commands:');
  console.log('  starbot login         - authenticate (captures token via Puppeteer)');
  console.log('  starbot balance       - show Starbucks card balance');
  console.log('  starbot stores        - find nearby stores');
}

const [,, cmd, ...args] = process.argv;
switch (cmd) {
  case 'login': login().catch(console.error); break;
  case 'balance': balance().catch(console.error); break;
  case 'stores': stores(args.join(' ')).catch(console.error); break;
  default: printUsage();
}
