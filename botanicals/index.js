#!/usr/bin/env node
/**
 * botanicals — Greenland Botanicals WooCommerce automation
 * Login via curl-style fetch (standard WP session cookies)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jarPath = path.join(__dirname, '.cookies.txt');
const BASE = 'https://greenlandbotanicals.cc';

function getCredentials() {
  try {
    const email = execSync(`security find-internet-password -s "greenlandbotanicals.cc" -a "jatrommel@gmail.com" -w 2>/dev/null`, { encoding: 'utf8' }).trim();
    return { username: 'jatrommel@gmail.com', password: email };
  } catch {}
  // Fallback to .env
  try {
    const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; }));
    return { username: env.BOTANICALS_EMAIL, password: env.BOTANICALS_PASSWORD };
  } catch {}
  return null;
}

function curl(args) {
  return execSync(`/usr/bin/curl ${args}`, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

function login() {
  // Get nonce
  const page = curl(`-c "${jarPath}" -sL "${BASE}/my-account/" -A "Mozilla/5.0"`);
  const nonceMatch = page.match(/woocommerce-login-nonce" value="([^"]+)"/);
  if (!nonceMatch) { console.error('Could not get login nonce'); process.exit(1); }
  const nonce = nonceMatch[1];

  const creds = getCredentials();
  if (!creds) { console.error('No credentials found. Add to keychain or .env'); process.exit(1); }

  const enc = (s) => encodeURIComponent(s);
  const result = curl(`-b "${jarPath}" -c "${jarPath}" -sL "${BASE}/my-account/" -A "Mozilla/5.0" -H "Content-Type: application/x-www-form-urlencoded" -H "Origin: ${BASE}" -H "Referer: ${BASE}/my-account/" --data "username=${enc(creds.username)}&password=${enc(creds.password)}&woocommerce-login-nonce=${nonce}&_wp_http_referer=%2Fmy-account%2F&login=Log+in"`);
  
  if (result.includes(creds.username)) {
    console.log('Logged in as', creds.username);
    return true;
  }
  console.error('Login failed');
  return false;
}

function ensureLoggedIn() {
  if (!fs.existsSync(jarPath)) return login();
  const check = curl(`-b "${jarPath}" -sL "${BASE}/my-account/" -A "Mozilla/5.0"`);
  if (!check.includes('jatrommel')) return login();
  return true;
}

function points() {
  ensureLoggedIn();
  const result = curl(`-b "${jarPath}" -sL "${BASE}/wp-admin/admin-ajax.php" -A "Mozilla/5.0" --data "action=srp_get_total_points"`);
  const pts = parseInt(result.trim());
  if (!isNaN(pts)) {
    console.log(`Reward points: ${pts}`);
  } else {
    console.log('Points: 0 (or not earned yet)');
  }
}

function orders() {
  ensureLoggedIn();
  const page = curl(`-b "${jarPath}" -sL "${BASE}/my-account/orders/" -A "Mozilla/5.0"`);
  const orderMatches = [...page.matchAll(/#(\d{4,})/g)].map(m => m[1]);
  const dates = [...page.matchAll(/([A-Z][a-z]+ \d{1,2}, \d{4})/g)].map(m => m[1]);
  const totals = [...page.matchAll(/\$([0-9]+\.[0-9]+)/g)].map(m => '$' + m[1]);
  const statuses = [...page.matchAll(/(Completed|Processing|Pending|Cancelled)/g)].map(m => m[1]);
  
  if (!orderMatches.length) { console.log('No orders found.'); return; }
  orderMatches.forEach((id, i) => {
    console.log(`#${id} — ${dates[i] || '?'} — ${totals[i] || '?'} — ${statuses[i] || '?'}`);
  });
}

function printUsage() {
  console.log('botanicals commands:');
  console.log('  botanicals login   - authenticate');
  console.log('  botanicals points  - check reward points');
  console.log('  botanicals orders  - list order history');
}

const [,, cmd] = process.argv;
switch (cmd) {
  case 'login': login(); break;
  case 'points': points(); break;
  case 'orders': orders(); break;
  default: printUsage();
}
