// One-shot: login and capture the auth token from XHR
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')
      .filter(l => l.includes('=')).map(l => { const [k,...v]=l.split('='); return [k.trim(), v.join('=').trim()]; })
  );
}

const env = loadEnv();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const captured = [];

// Intercept ALL responses and log relevant ones
page.on('response', async res => {
  const url = res.url();
  const status = res.status();
  const ct = res.headers()['content-type'] || '';
  if (ct.includes('json') && !url.includes('newrelic') && !url.includes('google') && !url.includes('analytics')) {
    try {
      const text = await res.text();
      if (text.length < 50000 && (text.includes('card') || text.includes('token') || text.includes('reward') || text.includes('balance') || text.includes('account'))) {
        captured.push({ url, status, body: text.slice(0, 500) });
      }
    } catch {}
  }
});

page.on('request', req => {
  const auth = req.headers()['authorization'];
  if (auth) console.log('AUTH HEADER:', auth.slice(0, 50), 'on', req.url().slice(0, 80));
  req.continue();
});
await page.setRequestInterception(true);

console.log('Signing in...');
await page.goto('https://www.starbucks.ca/account/signin', { waitUntil: 'networkidle2', timeout: 30000 });
await page.type('input[type="email"]', env.SBUX_EMAIL, { delay: 20 });
await page.type('input[type="password"]', env.SBUX_PASSWORD, { delay: 20 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{}),
  page.click('button[type="submit"]'),
]);

await new Promise(r => setTimeout(r, 3000));
console.log('Navigating to account overview...');
await page.goto('https://www.starbucks.ca/account/overview', { waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 4000));

console.log('\n=== Captured API calls ===');
captured.forEach(c => console.log(c.url, '->', c.status, '\n', c.body.slice(0, 200), '\n'));

await browser.close();
