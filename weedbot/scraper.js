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

/**
 * Scrapes a WooCommerce order confirmation/receipt page.
 * Intended to run inside page.evaluate() -- pure DOM access, no closures.
 */
function scrapeReceiptFromDOM() {
  const text = sel => document.querySelector(sel)?.innerText?.trim() || '';

  const orderNumber = text('.woocommerce-order-overview__order strong') ||
    (document.querySelector('.woocommerce-order-overview__order')?.innerText?.match(/(\d+)/) || [])[1] || '';
  const date = text('.woocommerce-order-overview__date strong') ||
    (document.querySelector('.woocommerce-order-overview__date')?.innerText?.match(/:\s*(.+)/) || [])[1] || '';
  const email = text('.woocommerce-order-overview__email strong') ||
    (document.querySelector('.woocommerce-order-overview__email')?.innerText?.match(/:\s*(.+)/) || [])[1] || '';
  const total = text('.woocommerce-order-overview__total strong .woocommerce-Price-amount') ||
    text('.woocommerce-order-overview__total strong') || '';
  const paymentMethod = text('.woocommerce-order-overview__payment-method strong') ||
    (document.querySelector('.woocommerce-order-overview__payment-method')?.innerText?.match(/:\s*(.+)/) || [])[1] || '';

  const items = [];
  document.querySelectorAll('.woocommerce-table--order-details tbody .order_item, .woocommerce-table--order-details tbody tr').forEach(row => {
    const name = row.querySelector('.product-name')?.childNodes[0]?.textContent?.trim() || row.querySelector('.product-name')?.innerText?.trim() || '';
    const qtyMatch = row.querySelector('.product-name .product-quantity')?.innerText?.match(/(\d+)/) || [];
    const qty = parseInt(qtyMatch[1], 10) || 1;
    const itemTotal = row.querySelector('.product-total .woocommerce-Price-amount')?.innerText?.trim() ||
      row.querySelector('.product-total')?.innerText?.trim() || '';
    if (name) items.push({ name: name.replace(/\s*×\s*\d+$/, '').trim(), qty, total: itemTotal });
  });

  const subtotal = text('.woocommerce-table--order-details tfoot tr:first-child td') || '';
  const shipping = (() => {
    const rows = document.querySelectorAll('.woocommerce-table--order-details tfoot tr');
    for (const r of rows) {
      const label = r.querySelector('th')?.innerText?.trim() || '';
      if (/shipping/i.test(label)) return r.querySelector('td')?.innerText?.trim() || '';
    }
    return '';
  })();

  let deliveryDate = '';
  let deliveryTime = '';
  let oosPreference = '';
  document.querySelectorAll('.woocommerce-table--order-details tfoot tr, .woocommerce-order-overview li').forEach(el => {
    const label = (el.querySelector('th') || el.querySelector('strong'))?.innerText?.trim().toLowerCase() || '';
    const val = el.querySelector('td')?.innerText?.trim() || el.querySelector('span')?.innerText?.trim() || '';
    if (label.includes('delivery date') || label.includes('date')) {
      if (!deliveryDate && val && /\w+ \d+/.test(val)) deliveryDate = val;
    }
    if (label.includes('time')) deliveryTime = val;
    if (label.includes('out of stock') || label.includes('oos')) oosPreference = val;
  });

  return { orderNumber, date, email, total, paymentMethod, shipping, deliveryDate, deliveryTime, items, subtotal, oosPreference };
}

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

export async function scrapeConfirmation(url) {
  const cookies = loadCookies();
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  if (cookies) await page.setCookie(...cookies);

  await page.goto(url, { waitUntil: 'networkidle2' });

  const receipt = await page.evaluate(scrapeReceiptFromDOM);
  await browser.close();
  return receipt;
}

export async function placeRemoteOrder(productUrl, quantity, options = {}) {
  const cookies = loadCookies();
  if (!cookies) { throw new Error('Not logged in. Run: weed login'); }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setCookie(...cookies);

  // Navigate to product page and add to cart
  await page.goto(productUrl, { waitUntil: 'networkidle2' });

  // Set quantity
  const qtyInput = await page.$('input.qty, input[name="quantity"]');
  if (qtyInput) {
    await qtyInput.click({ clickCount: 3 });
    await qtyInput.type(String(quantity));
  }

  // Click add to cart
  const addBtn = await page.$('button.single_add_to_cart_button, button[name="add-to-cart"]');
  if (!addBtn) { await browser.close(); throw new Error('Add to cart button not found on product page'); }
  await addBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
  // Some WooCommerce themes use AJAX add-to-cart; wait a moment then navigate
  await new Promise(r => setTimeout(r, 2000));

  // Navigate to checkout
  const rootUrl = getRootUrl();
  await page.goto(rootUrl + '/checkout/', { waitUntil: 'networkidle2' });

  // Fill billing fields from env/options
  const billing = {
    first_name: (options.name || process.env.GB_NAME || '').split(' ')[0],
    last_name: (options.name || process.env.GB_NAME || '').split(' ').slice(1).join(' '),
    address_1: options.address || process.env.GB_ADDRESS || '',
    city: options.city || process.env.GB_CITY || '',
    state: options.province || process.env.GB_PROVINCE || '',
    postcode: options.postal || process.env.GB_POSTAL || '',
    phone: options.phone || process.env.GB_PHONE || '',
    email: options.email || process.env.GB_EMAIL || ''
  };

  for (const [field, value] of Object.entries(billing)) {
    const sel = `#billing_${field}`;
    const el = await page.$(sel);
    if (el && value) {
      await el.click({ clickCount: 3 });
      await el.type(value);
    }
  }

  // Select province from dropdown if present
  if (billing.state) {
    const stateSelect = await page.$('#billing_state');
    if (stateSelect) {
      const tagName = await page.evaluate(el => el.tagName, stateSelect);
      if (tagName === 'SELECT') {
        await page.select('#billing_state', billing.state);
      }
    }
  }

  // Select Cash on Delivery payment
  const codRadio = await page.$('#payment_method_cod, input[value="cod"]');
  if (codRadio) await codRadio.click();

  // Select delivery date/time if available
  if (options.deliveryDate) {
    const dateInput = await page.$('input[name*="delivery_date"], #delivery_date');
    if (dateInput) { await dateInput.click({ clickCount: 3 }); await dateInput.type(options.deliveryDate); }
  }
  if (options.deliveryTime) {
    const timeSelect = await page.$('select[name*="delivery_time"], #delivery_time');
    if (timeSelect) await page.select(timeSelect, options.deliveryTime);
  }

  // Wait for any AJAX updates to finish
  await new Promise(r => setTimeout(r, 2000));

  // Place order
  const placeBtn = await page.$('#place_order, button.wc-block-components-checkout-place-order-button');
  if (!placeBtn) { await browser.close(); throw new Error('Place order button not found'); }
  await placeBtn.click();

  // Wait for confirmation page
  try {
    await page.waitForFunction(
      () => window.location.href.includes('/order-received/') || window.location.href.includes('/checkout/order-received/'),
      { timeout: 30000 }
    );
  } catch {
    const currentUrl = page.url();
    await browser.close();
    throw new Error('Order confirmation page not reached. Current URL: ' + currentUrl);
  }

  const confirmationUrl = page.url();

  const receipt = await page.evaluate(scrapeReceiptFromDOM);
  receipt.confirmationUrl = confirmationUrl;
  await browser.close();
  return receipt;
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
