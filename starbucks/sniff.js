import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  return Object.fromEntries(fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const[k,...v]=l.split('=');return[k.trim(),v.join('=').trim()];}));
}
const env = loadEnv();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const calls = [];
await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  const headers = req.headers();
  if (url.includes('starbucks') && !url.includes('analytics') && !url.includes('newrelic') && !url.includes('optimizely') && !url.includes('_bc')) {
    calls.push({ type: 'req', url, headers: Object.fromEntries(Object.entries(headers).filter(([k])=>['authorization','cookie','x-csrf','content-type','x-api-key','x-requested-with'].includes(k.toLowerCase()))) });
  }
  req.continue();
});
page.on('response', async res => {
  const url = res.url();
  if (url.includes('starbucks') && !url.includes('analytics') && !url.includes('newrelic') && !url.includes('optimizely') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
    const status = res.status();
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch {}
    if (body && body !== '<!DOCTYPE html>') calls.push({ type: 'res', url, status, body });
  }
});

await page.goto('https://www.starbucks.ca/account/signin', { waitUntil: 'networkidle2', timeout: 30000 });
await page.type('input[type="email"]', env.SBUX_EMAIL, { delay: 20 });
await page.type('input[type="password"]', env.SBUX_PASSWORD, { delay: 20 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{}),
  page.click('button[type="submit"]'),
]);
await new Promise(r => setTimeout(r, 5000));
await page.goto('https://www.starbucks.ca/account/overview', { waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 4000));

console.log('=== All Starbucks network calls ===');
calls.forEach(c => {
  if (c.type === 'req') {
    console.log('REQ:', c.url.slice(0, 120));
    if (Object.keys(c.headers).length) console.log('  headers:', JSON.stringify(c.headers).slice(0, 200));
  } else {
    console.log('RES:', c.status, c.url.slice(0, 120));
    if (c.body && c.body.trim() !== '<!DOCTYPE html>') console.log('  body:', c.body.slice(0, 150));
  }
});

await browser.close();
