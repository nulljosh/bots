import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionPath = path.join(__dirname, 'session.json');
const configPath = path.join(__dirname, 'config.json');

function loadConfig() { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
function getRootUrl() { return loadConfig().rootUrl || 'https://greenlandbotanicals.cc'; }

function saveCookies(cookies) { fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2)); }
function loadCookies() { try { return JSON.parse(fs.readFileSync(sessionPath, 'utf8')); } catch { return null; } }

export async function login() {
  const username = process.env.GB_USERNAME;
  const password = process.env.GB_PASSWORD;
  if (!username || !password) { console.error('Set GB_USERNAME and GB_PASSWORD in .env'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const rootUrl = getRootUrl();

  await page.goto(rootUrl + '/my-account/', { waitUntil: 'networkidle2' });
  await page.type('#username', username);
  await page.type('#password', password);
  await page.click('button[name="login"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  const loggedIn = await page.$('a[href*="customer-logout"]');
  if (!loggedIn) { console.error('Login failed. Check credentials.'); await browser.close(); process.exit(1); }

  const cookies = await page.cookies();
  saveCookies(cookies);
  console.log('Logged in successfully. Session saved.');
  await browser.close();
}

export async function showAccount() {
  const cookies = loadCookies();
  if (!cookies) { console.error('Not logged in. Run: weed login'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCookie(...cookies);

  const rootUrl = getRootUrl();
  await page.goto(rootUrl + '/my-account/', { waitUntil: 'networkidle2' });

  const info = await page.evaluate(() => {
    const content = document.querySelector('.woocommerce-MyAccount-content');
    return content ? content.innerText.trim() : 'Could not load account info.';
  });

  console.log('Account Dashboard:');
  console.log(info);
  await browser.close();
}

export async function fetchRemoteOrders() {
  const cookies = loadCookies();
  if (!cookies) { console.error('Not logged in. Run: weed login'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCookie(...cookies);

  const rootUrl = getRootUrl();
  await page.goto(rootUrl + '/my-account/orders/', { waitUntil: 'networkidle2' });

  const orders = await page.evaluate(() => {
    const rows = document.querySelectorAll('.woocommerce-orders-table__row');
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');
      return {
        id: cells[0]?.innerText?.trim() || '',
        date: cells[1]?.innerText?.trim() || '',
        status: cells[2]?.innerText?.trim() || '',
        total: cells[3]?.innerText?.trim() || '',
        actions: cells[4]?.innerText?.trim() || ''
      };
    });
  });

  if (!orders.length) { console.log('No remote orders found.'); await browser.close(); return; }

  console.log('Remote Orders:');
  orders.forEach(o => {
    console.log(`  ${o.id}  ${o.date}  ${o.status}  ${o.total}`);
  });
  await browser.close();
}

export async function fetchOrderDetails(orderId) {
  const cookies = loadCookies();
  if (!cookies) { console.error('Not logged in. Run: weed login'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCookie(...cookies);

  const rootUrl = getRootUrl();
  await page.goto(rootUrl + '/my-account/view-order/' + orderId + '/', { waitUntil: 'networkidle2' });

  const details = await page.evaluate(() => {
    const items = document.querySelectorAll('.woocommerce-table--order-details .order_item');
    const lineItems = Array.from(items).map(row => {
      const name = row.querySelector('.product-name')?.innerText?.trim() || '';
      const total = row.querySelector('.product-total')?.innerText?.trim() || '';
      return { name, total };
    });
    const orderTotal = document.querySelector('.order-total .amount')?.innerText?.trim() || '';
    return { lineItems, orderTotal };
  });

  console.log('Order #' + orderId + ':');
  details.lineItems.forEach(item => {
    console.log('  ' + item.name + '  ' + item.total);
  });
  if (details.orderTotal) console.log('  Total: ' + details.orderTotal);
  await browser.close();
}

export async function scrapeLiveCategory(category) {
  const cookies = loadCookies();
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  if (cookies) await page.setCookie(...cookies);

  const rootUrl = getRootUrl();
  const url = rootUrl + '/product-category/' + category + '/';
  await page.goto(url, { waitUntil: 'networkidle2' });

  const products = await page.evaluate(() => {
    const items = document.querySelectorAll('.products .product');
    return Array.from(items).map(el => {
      const name = el.querySelector('.woocommerce-loop-product__title')?.innerText?.trim() || '';
      const price = el.querySelector('.price')?.innerText?.trim() || '';
      const link = el.querySelector('a')?.href || '';
      return { name, price, link };
    });
  });

  if (!products.length) { console.log('No products found for category: ' + category); await browser.close(); return; }

  console.log(category.toUpperCase() + ' (live):');
  products.forEach(p => {
    console.log('  ' + p.name + '  ' + p.price);
  });
  console.log('\n' + products.length + ' products listed');
  await browser.close();
}
