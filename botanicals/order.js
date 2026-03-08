#!/usr/bin/env node
/**
 * Greenland Botanicals ordering engine
 * Flow: search product → get variation → add to cart → checkout with saved payment
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jarPath = path.join(__dirname, '.cookies.txt');
const BASE = 'https://greenlandbotanicals.cc';

// Weight slug mapping: user input → WC attribute value
const WEIGHT_MAP = {
  '1': '1g', '1g': '1g',
  '3.5': '3-5g', '3.5g': '3-5g', '1/8': '3-5g', 'eighth': '3-5g',
  '7': '7g', '7g': '7g', '1/4': '7g', 'quarter': '7g',
  '14': '14g', '14g': '14g', '1/2': '14g', 'half': '14g',
  '28': '28g', '28g': '28g', '1oz': '28g', 'oz': '28g', 'ounce': '28g',
};

function curl(args) {
  return execSync(`/usr/bin/curl ${args}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

function ensureLoggedIn() {
  if (!fs.existsSync(jarPath)) {
    console.log('Not logged in. Run: node index.js login');
    process.exit(1);
  }
  const check = curl(`-b "${jarPath}" -sL "${BASE}/my-account/" -A "Mozilla/5.0"`);
  if (!check.includes('jatrommel')) {
    // Re-login
    const { execSync: ex } = await import('child_process');
    execSync('node index.js login', { cwd: __dirname, stdio: 'inherit' });
  }
}

async function searchProduct(query) {
  // Search the shop for the product
  const encoded = encodeURIComponent(query);
  const html = curl(`-b "${jarPath}" -sL "${BASE}/?s=${encoded}&post_type=product" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"`);
  
  // Extract product URLs and IDs
  const products = [];
  const matches = [...html.matchAll(/href="(https:\/\/greenlandbotanicals\.cc\/product\/([^"\/]+)\/)"[^>]*>([^<]*)<\/a>/g)];
  
  // Also get product IDs from data attributes
  const pidMatches = [...html.matchAll(/data-product_id="(\d+)"/g)];
  const pids = [...new Set(pidMatches.map(m => m[1]))];

  // Get product names and slugs from links
  const linkMatches = [...html.matchAll(/href="https:\/\/greenlandbotanicals\.cc\/product\/([^"\/]+)\/"/g)];
  const slugs = [...new Set(linkMatches.map(m => m[1]))];

  return slugs.map((slug, i) => ({ slug, productId: pids[i] || null }));
}

async function getVariation(productId, weightSlug) {
  const result = curl(`-b "${jarPath}" -s "${BASE}/?wc-ajax=get_variation" -A "Mozilla/5.0" -H "Content-Type: application/x-www-form-urlencoded" --data "product_id=${productId}&attribute_pa_weight-g=${weightSlug}"`);
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

async function addToCart(productId, variationId, quantity = 1) {
  // Get nonce from product page first
  const productPage = curl(`-b "${jarPath}" -sL "${BASE}/?p=${productId}" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"`);
  const nonceMatch = productPage.match(/"nonce":"([^"]+)"/);
  const nonce = nonceMatch ? nonceMatch[1] : '';

  const result = curl(`-b "${jarPath}" -c "${jarPath}" -s "${BASE}/?wc-ajax=add_to_cart" -A "Mozilla/5.0" -H "Content-Type: application/x-www-form-urlencoded" --data "product_id=${productId}&variation_id=${variationId}&quantity=${quantity}&nonce=${nonce}"`);
  try {
    const json = JSON.parse(result);
    return json.error ? null : json;
  } catch {
    return null;
  }
}

async function getCheckoutNonce() {
  const cart = curl(`-b "${jarPath}" -sL "${BASE}/cart/" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"`);
  const nonceMatch = cart.match(/woocommerce-process-checkout-nonce" value="([^"]+)"/);
  return nonceMatch ? nonceMatch[1] : null;
}

async function placeOrder(productSlug, weightInput, qty = 1) {
  ensureLoggedIn();

  const weightSlug = WEIGHT_MAP[weightInput?.toLowerCase()] || weightInput;
  if (!weightSlug) {
    console.error(`Unknown weight: ${weightInput}. Use: 1g, 3.5g, 7g, 14g, 28g`);
    process.exit(1);
  }

  console.log(`Searching for "${productSlug}"...`);

  // Get product ID from the product page directly
  const slug = productSlug.toLowerCase().replace(/\s+/g, '-');
  const productPage = curl(`-b "${jarPath}" -sL "${BASE}/product/${slug}/" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"`);
  
  if (productPage.includes('Page Not Found') || productPage.includes('404')) {
    // Try search
    console.log('Direct URL failed, searching...');
    const results = await searchProduct(productSlug);
    if (!results.length) { console.error(`Product not found: ${productSlug}`); process.exit(1); }
    console.log('Found products:', results.map(r => r.slug).join(', '));
    process.exit(0);
  }

  const pidMatch = productPage.match(/data-product_id="(\d+)"/);
  if (!pidMatch) { console.error('Could not find product ID'); process.exit(1); }
  const productId = pidMatch[1];
  console.log(`Product ID: ${productId}`);

  // Get variation for the requested weight
  console.log(`Getting ${weightSlug} variation...`);
  const variation = await getVariation(productId, weightSlug);
  if (!variation || !variation.variation_id) {
    console.error(`No variation found for ${weightSlug}`);
    process.exit(1);
  }
  console.log(`Variation ID: ${variation.variation_id} — $${variation.display_price}`);

  // Confirm before adding to cart
  const weightLabel = Object.entries(WEIGHT_MAP).find(([k, v]) => v === weightSlug && k.includes('.'))?.[0] || weightSlug;
  console.log(`\nReady to order: ${qty}x ${productSlug} (${weightLabel}) for $${variation.display_price}`);

  // Add to cart
  console.log('Adding to cart...');
  const cartResult = await addToCart(productId, variation.variation_id, qty);
  if (!cartResult) {
    console.error('Failed to add to cart. Check if product is in stock.');
    process.exit(1);
  }
  console.log('Added to cart!');

  // Get checkout nonce
  const checkoutNonce = await getCheckoutNonce();
  if (!checkoutNonce) { console.error('Could not get checkout nonce'); process.exit(1); }

  // Place order using saved payment + address
  console.log('Placing order...');
  const orderResult = curl(`-b "${jarPath}" -c "${jarPath}" -sL "${BASE}/checkout/" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Content-Type: application/x-www-form-urlencoded" -H "Referer: ${BASE}/checkout/" --data "woocommerce-process-checkout-nonce=${checkoutNonce}&_wp_http_referer=%2Fcheckout%2F&payment_method=saved_payment&wc-saved-payment-methods-token=new&terms=1&woocommerce_checkout_place_order=Place+order"`);

  // Check result
  const orderMatch = orderResult.match(/order-received\/(\d+)/);
  if (orderMatch) {
    console.log(`\nOrder placed! Order #${orderMatch[1]}`);
    console.log(`View: ${BASE}/my-account/view-order/${orderMatch[1]}/`);
  } else if (orderResult.includes('thank-you') || orderResult.includes('order-received')) {
    console.log('\nOrder placed successfully!');
  } else {
    console.error('\nOrder may have failed. Check checkout manually:');
    console.error(`${BASE}/checkout/`);
  }
}

// CLI
const [,, ...args] = process.argv;
const slug = args.slice(0, -1).join(' ') || args[0];
const weight = args[args.length - 1];

if (!slug || !weight) {
  console.log('Usage: node order.js <product-name> <weight>');
  console.log('  node order.js "alaskan thunderfuck" 3.5g');
  console.log('  node order.js "blue dream" 7g');
  process.exit(0);
}

placeOrder(slug, weight).catch(console.error);
