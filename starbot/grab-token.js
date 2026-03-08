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

await page.setRequestInterception(true);
page.on('request', req => req.continue());

await page.goto('https://www.starbucks.ca/account/signin', { waitUntil: 'networkidle2', timeout: 30000 });
await page.type('input[type="email"]', env.SBUX_EMAIL, { delay: 20 });
await page.type('input[type="password"]', env.SBUX_PASSWORD, { delay: 20 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{}),
  page.click('button[type="submit"]'),
]);
await new Promise(r => setTimeout(r, 4000));
await page.goto('https://www.starbucks.ca/account/overview', { waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 3000));

// Dump localStorage and sessionStorage
const storage = await page.evaluate(() => {
  const ls = {}, ss = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    ls[k] = localStorage.getItem(k);
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    ss[k] = sessionStorage.getItem(k);
  }
  return { localStorage: ls, sessionStorage: ss };
});

console.log('=== localStorage keys ===');
Object.keys(storage.localStorage).forEach(k => {
  const v = storage.localStorage[k];
  if (v && (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('user') || k.toLowerCase().includes('access'))) {
    console.log(k, ':', v.slice(0, 200));
  }
});

console.log('\n=== sessionStorage keys ===');
Object.keys(storage.sessionStorage).forEach(k => {
  console.log(k, ':', storage.sessionStorage[k]?.slice(0, 200));
});

// Dump all localStorage if nothing found
console.log('\n=== all localStorage ===');
Object.keys(storage.localStorage).forEach(k => console.log(k));

fs.writeFileSync(path.join(__dirname, 'storage-dump.json'), JSON.stringify(storage, null, 2));
console.log('\nFull dump saved to storage-dump.json');

await browser.close();
