import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  return Object.fromEntries(fs.readFileSync(path.join(__dirname, '.env'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const[k,...v]=l.split('=');return[k.trim(),v.join('=').trim()];}));
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
await new Promise(r => setTimeout(r, 5000));
await page.goto('https://www.starbucks.ca/account/overview', { waitUntil: 'networkidle2', timeout: 20000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 3000));

// CDP gives us ALL cookies including httpOnly
const client = await page.createCDPSession();
const { cookies } = await client.send('Network.getAllCookies');
console.log('ALL cookies (including httpOnly):');
cookies.filter(c => c.domain.includes('starbucks')).forEach(c => {
  console.log(`${c.httpOnly ? '[httpOnly]' : '[js]     '} ${c.name} = ${c.value.slice(0,60)} (${c.domain})`);
});

fs.writeFileSync(path.join(__dirname, 'all-cookies.json'), JSON.stringify(cookies.filter(c=>c.domain.includes('starbucks')), null, 2));
await browser.close();
