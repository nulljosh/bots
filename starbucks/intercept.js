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

// Inject XHR/fetch interceptor before page loads
await page.evaluateOnNewDocument(() => {
  window.__capturedTokens = [];
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url || '';
    const headers = init?.headers || (input?.headers) || {};
    const auth = headers['authorization'] || headers['Authorization'] || 
                 (headers.get && headers.get('authorization'));
    if (auth && url.includes('starbucks')) {
      window.__capturedTokens.push({ url, auth });
      console.log('INTERCEPTED:', url, auth.slice(0, 30));
    }
    return origFetch.apply(this, args);
  };

  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (name.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
      window.__capturedTokens.push({ url: this._url, auth: value });
    }
    return origXHRSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return origXHROpen.apply(this, arguments);
  };
});

await page.goto('https://www.starbucks.ca/account/signin', { waitUntil: 'networkidle2', timeout: 30000 });
await page.type('input[type="email"]', env.SBUX_EMAIL, { delay: 20 });
await page.type('input[type="password"]', env.SBUX_PASSWORD, { delay: 20 });

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{}),
  page.click('button[type="submit"]'),
]);
await new Promise(r => setTimeout(r, 4000));

await page.goto('https://www.starbucks.ca/account/overview', { waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 4000));

const captured = await page.evaluate(() => window.__capturedTokens);
console.log('Captured tokens:', JSON.stringify(captured, null, 2));

if (captured.length) {
  const token = captured[0].auth.replace('Bearer ', '');
  fs.writeFileSync(path.join(__dirname, '.session.json'), JSON.stringify({ token, capturedAt: new Date().toISOString() }, null, 2));
  console.log('Token saved!');
} else {
  console.log('No tokens intercepted — Starbucks likely uses a server-side session.');
}

await browser.close();
