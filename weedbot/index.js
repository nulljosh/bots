import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data.json');
const backupPath = path.join(__dirname, 'data.backup.json');
const configPath = path.join(__dirname, 'config.json');
const usersPath = path.join(__dirname, 'users.json');
const ordersPath = path.join(__dirname, 'orders.json');
const sessionPath = path.join(__dirname, 'session.json');

const BAG_SIZES = [1, 3.5, 7, 14, 28];

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')); }
  catch { return { users: [], requireAuth: false, protectedCommands: [] }; }
}
function authenticate(name, pin) {
  const { users } = loadUsers();
  return users.find(u => u.name.toLowerCase() === (name || '').toLowerCase() && u.pin === pin) || null;
}
function checkAuth(command, args) {
  const cfg = loadUsers();
  if (!cfg.requireAuth || !cfg.protectedCommands.includes(command)) return { name: 'anonymous' };
  const ui = args.indexOf('--user');
  const pi = args.indexOf('--pin');
  const userName = ui !== -1 ? args[ui + 1] : null;
  const pin = pi !== -1 ? args[pi + 1] : null;
  if (!userName || !pin) { console.error(`Auth required for "${command}". Add --user <name> --pin <pin>`); process.exit(1); }
  const user = authenticate(userName, pin);
  if (!user) { console.error('Invalid username or PIN.'); process.exit(1); }
  return user;
}
function stripAuthFlags(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' || args[i] === '--pin') i++;
    else out.push(args[i]);
  }
  return out;
}

function defaultCategories() {
  return {
    flower: { unit: 'g', subcategories: [] },
    extracts: { unit: 'g', subcategories: [] },
    edibles: { unit: 'mg', subcategories: [] },
    mushrooms: { unit: 'g', subcategories: [] },
    vapes: { unit: 'unit', subcategories: [] },
    nicotine: { unit: 'unit', subcategories: [] },
    accessories: { unit: 'unit', subcategories: [] }
  };
}
function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      sessionSize: parsed.sessionSize ?? 0.3,
      rootUrl: parsed.rootUrl || 'https://greenlandbotanicals.cc',
      categories: parsed.categories || defaultCategories()
    };
  } catch {
    return { sessionSize: 0.3, rootUrl: 'https://greenlandbotanicals.cc', categories: defaultCategories() };
  }
}
function saveConfig(cfg) { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2)); }
function getCategoryConfig(cfg, category) { return cfg.categories[category] || null; }
function getDefaultUnit(cfg, category) {
  return getCategoryConfig(cfg, category)?.unit || 'g';
}
function normalizeItem(item, cfg) {
  const migrated = { ...item };
  if (migrated.strain && !migrated.name) {
    migrated.name = migrated.strain;
    migrated.category = 'flower';
    migrated.unit = 'g';
    migrated.subcategory = null;
    migrated.vendor = null;
    migrated.url = null;
  }
  migrated.name = migrated.name || 'Unknown Item';
  migrated.category = migrated.category || 'flower';
  migrated.subcategory = migrated.subcategory ?? null;
  migrated.vendor = migrated.vendor ?? null;
  migrated.url = migrated.url ?? null;
  migrated.unit = migrated.unit || getDefaultUnit(cfg, migrated.category);
  migrated.prices = migrated.prices || {};
  migrated.dateAdded = migrated.dateAdded || new Date().toISOString();
  delete migrated.strain;
  return migrated;
}
function loadData(cfg) {
  if (!cfg) cfg = loadConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.history)) return { inventory: [], history: [] };
    return {
      inventory: parsed.inventory.map(item => normalizeItem(item, cfg)),
      history: parsed.history
    };
  } catch {
    return { inventory: [], history: [] };
  }
}
function saveData(data) {
  if (fs.existsSync(dataPath)) fs.copyFileSync(dataPath, backupPath);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ordersPath, 'utf8')); }
  catch { return []; }
}
function saveOrders(orders) { fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2)); }

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
function fuzzyFind(inventory, query) {
  const q = query.toLowerCase();
  const exact = inventory.find(i => i.name.toLowerCase() === q);
  if (exact) return exact;
  const sub = inventory.filter(i => i.name.toLowerCase().includes(q));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) return { ambiguous: true, matches: sub };
  const scored = inventory
    .map(i => ({ item: i, dist: levenshtein(i.name.toLowerCase(), q) }))
    .filter(x => x.dist <= 2)
    .sort((a, b) => a.dist - b.dist);
  if (scored.length === 1) return scored[0].item;
  if (scored.length > 1) return { ambiguous: true, matches: scored.map(x => x.item) };
  return null;
}
function resolveItem(data, nameArgs) {
  const query = nameArgs.join(' ');
  const result = fuzzyFind(data.inventory, query);
  if (!result) { console.error(`Item not found: "${query}"`); process.exit(1); }
  if (result.ambiguous) {
    console.error(`Ambiguous: "${query}". Did you mean:\n${result.matches.map(m => `  - ${m.name} [${m.category}]`).join('\n')}`);
    process.exit(1);
  }
  return result;
}

function round1(n) { return Math.round(n * 10) / 10; }
function formatPrice(n) { return n != null ? `$${n.toFixed(2)}` : '—'; }
function formatQty(item) { return `${item.quantity}${item.unit}`; }
function getDisplayName(obj) { return obj.name || 'Unknown Item'; }
function getHistoryUnit(entry, data) {
  if (entry.unit) return entry.unit;
  const name = getDisplayName(entry).toLowerCase();
  const item = data.inventory.find(i => i.name.toLowerCase() === name);
  return item?.unit || 'g';
}
function getPrice(item, qty) {
  const prices = item.prices || {};
  if (prices.bags && prices.bags[String(qty)] != null) return prices.bags[String(qty)];
  if (prices.perGram != null) return round1(prices.perGram * qty * 100) / 100;
  return null;
}
function bagPriceTable(item) {
  const prices = item.prices || {};
  const lines = [];
  for (const size of BAG_SIZES) {
    const p = getPrice(item, size);
    if (p != null) lines.push(`  ${size}${item.unit} = ${formatPrice(p)}`);
  }
  if (prices.perGram != null) lines.push(`  Per gram: ${formatPrice(prices.perGram)}`);
  return lines.length ? lines.join('\n') : '  No prices set';
}

function inventoryByCategory(data, category) {
  const items = category ? data.inventory.filter(i => i.category === category) : data.inventory;
  return items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
function categoryTotals(items) {
  return round1(items.reduce((sum, item) => sum + item.quantity, 0));
}
function summarizeTotalsByUnit(items) {
  const totals = new Map();
  items.forEach(item => {
    totals.set(item.unit, round1((totals.get(item.unit) || 0) + item.quantity));
  });
  return [...totals.entries()].map(([unit, total]) => `${total}${unit}`).join(', ');
}
function formatMeta(item) {
  const meta = [];
  if (item.subcategory) meta.push(item.subcategory);
  if (item.vendor) meta.push(item.vendor);
  return meta.length ? ` (${meta.join(', ')})` : '';
}
function printUsage() {
  console.log('Usage:');
  console.log('  weed [list] [category] [--prices]      - inventory grouped by category');
  console.log('  weed categories                        - local category summary');
  console.log('  weed browse [category] [--live]        - show config tree or live category listing');
  console.log('  weed stats [category]                  - summary');
  console.log('  weed log [n]                           - history');
  console.log('  weed find <query>                      - search across all categories');
  console.log('  weed add <name> <qty> [--cat <c>] [--sub <s>] [--vendor <v>]');
  console.log('  weed remove <name> <qty>               - reduce stock');
  console.log('  weed use [name] [qty]                  - log session');
  console.log('  weed delete <name>                     - remove item');
  console.log('  weed price <name> <$/g>                - set per-gram price');
  console.log('  weed price <name> bag <g> <$>          - set bag price');
  console.log('  weed order <name> <qty> [--local]       - place order (remote if URL set, --local to skip)');
  console.log('  weed orders [n]                        - view local order history');
  console.log('  weed orders --remote [id]              - view remote order history/details');
  console.log('  weed confirm <url|order-id>            - scrape order confirmation page');
  console.log('  weed login                             - create saved web session');
  console.log('  weed account                           - show remote account dashboard');
  console.log('  weed config session <qty>              - set default session size');
  console.log('  weed config url <url>                  - set store root URL');
}

function parseNameQtyArgs(args) {
  const qtyIndex = [...args].map((arg, index) => ({ arg, index }))
    .filter(({ arg }) => Number.isFinite(Number(arg)) && Number(arg) > 0)
    .map(({ index }) => index)
    .at(-1);
  if (qtyIndex == null) return null;
  const quantity = Number(args[qtyIndex]);
  const nameParts = args.slice(0, qtyIndex);
  if (!nameParts.length) return null;
  return { name: nameParts.join(' '), quantity, rest: args.slice(qtyIndex + 1) };
}
function parseAddArgs(args, cfg) {
  const filtered = [];
  let category = 'flower';
  let subcategory = null;
  let vendor = null;
  let url = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cat') category = args[++i] || '';
    else if (args[i] === '--sub') subcategory = args[++i] || '';
    else if (args[i] === '--vendor') vendor = args[++i] || '';
    else if (args[i] === '--url') url = args[++i] || '';
    else filtered.push(args[i]);
  }
  const parsed = parseNameQtyArgs(filtered);
  if (!parsed) return null;
  if (!getCategoryConfig(cfg, category)) {
    console.error(`Unknown category: ${category}`);
    process.exit(1);
  }
  if (subcategory && !cfg.categories[category].subcategories.includes(subcategory)) {
    console.error(`Unknown subcategory "${subcategory}" for category "${category}"`);
    process.exit(1);
  }
  return { ...parsed, category, subcategory, vendor, url };
}

function addItem(data, cfg, name, quantity, options = {}) {
  const category = options.category || 'flower';
  const unit = getDefaultUnit(cfg, category);
  const existing = data.inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.quantity = round1(existing.quantity + quantity);
    if (options.category) existing.category = category;
    if (options.subcategory !== undefined) existing.subcategory = options.subcategory;
    if (options.vendor !== undefined) existing.vendor = options.vendor;
    if (options.url !== undefined) existing.url = options.url;
    if (!existing.unit) existing.unit = unit;
  } else {
    data.inventory.push({
      name,
      quantity,
      category,
      subcategory: options.subcategory ?? null,
      vendor: options.vendor ?? null,
      unit,
      prices: {},
      dateAdded: new Date().toISOString(),
      url: options.url ?? null
    });
  }
  data.history.push({ action: 'add', name, quantity, unit, timestamp: new Date().toISOString() });
  saveData(data);
  const item = data.inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
  console.log(`Added ${quantity}${item.unit} of ${item.name}. Now have ${item.quantity}${item.unit}.`);
}
function setPrice(data, itemArgs) {
  const bagIdx = itemArgs.indexOf('bag');
  if (bagIdx !== -1) {
    const itemName = itemArgs.slice(0, bagIdx).join(' ');
    const size = Number(itemArgs[bagIdx + 1]);
    const price = Number(itemArgs[bagIdx + 2]);
    if (!itemName || !Number.isFinite(size) || !Number.isFinite(price)) {
      console.error('Usage: weed price <name> bag <g> <$>'); process.exit(1);
    }
    const item = resolveItem(data, [itemName]);
    item.prices = item.prices || {};
    item.prices.bags = item.prices.bags || {};
    item.prices.bags[String(size)] = price;
    saveData(data);
    console.log(`${item.name}: ${size}${item.unit} bag = ${formatPrice(price)}`);
  } else {
    const price = Number(itemArgs[itemArgs.length - 1]);
    const itemName = itemArgs.slice(0, -1).join(' ');
    if (!itemName || !Number.isFinite(price)) {
      console.error('Usage: weed price <name> <$/g>'); process.exit(1);
    }
    const item = resolveItem(data, [itemName]);
    item.prices = item.prices || {};
    item.prices.perGram = price;
    saveData(data);
    console.log(`${item.name}: ${formatPrice(price)}/g`);
  }
}
function printReceipt(receipt) {
  console.log('--- ORDER RECEIPT ---');
  if (receipt.orderNumber) console.log(`  Order #${receipt.orderNumber}`);
  if (receipt.date) console.log(`  Date: ${receipt.date}`);
  if (receipt.email) console.log(`  Email: ${receipt.email}`);
  if (receipt.items?.length) {
    receipt.items.forEach(item => {
      console.log(`  ${item.name} x${item.qty} ${item.total}`);
    });
  }
  if (receipt.subtotal) console.log(`  Subtotal: ${receipt.subtotal}`);
  if (receipt.shipping) console.log(`  Shipping: ${receipt.shipping}`);
  if (receipt.total) console.log(`  Total: ${receipt.total}`);
  if (receipt.paymentMethod) console.log(`  Payment: ${receipt.paymentMethod}`);
  if (receipt.deliveryDate) console.log(`  Delivery: ${receipt.deliveryDate}`);
  if (receipt.deliveryTime) console.log(`  Time: ${receipt.deliveryTime}`);
  if (receipt.oosPreference) console.log(`  OOS Preference: ${receipt.oosPreference}`);
  if (receipt.confirmationUrl) console.log(`  URL: ${receipt.confirmationUrl}`);
  console.log('--------------------');
}

function placeOrderLocal(data, item, quantity) {
  const price = getPrice(item, quantity);
  const order = {
    id: Date.now(),
    name: item.name,
    quantity,
    unit: item.unit,
    price,
    status: 'pending',
    placedAt: new Date().toISOString()
  };
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  console.log(`Order placed: ${quantity}${item.unit} of ${item.name}`);
  if (price != null) console.log(`  Price: ${formatPrice(price)}`);
  else console.log('  Price: not set for this quantity');
  console.log('  Status: pending');
  console.log(`  Order ID: ${order.id}`);
  return order;
}

async function placeOrder(data, itemArgs) {
  const localOnly = itemArgs.includes('--local');
  const filtered = itemArgs.filter(a => a !== '--local');
  const parsed = parseNameQtyArgs(filtered);
  if (!parsed || parsed.rest.length) { console.error('Usage: weed order <name> <qty> [--local]'); process.exit(1); }
  const item = resolveItem(data, [parsed.name]);

  if (localOnly || !item.url) {
    placeOrderLocal(data, item, parsed.quantity);
    if (!localOnly && !item.url) console.log('  (local-only: no product URL set. Use --url on add to enable remote checkout)');
    return;
  }

  // Remote checkout
  console.log(`Placing remote order: ${parsed.quantity}x ${item.name}...`);
  try {
    const { placeRemoteOrder } = await import('./scraper.js');
    const receipt = await placeRemoteOrder(item.url, parsed.quantity);
    printReceipt(receipt);

    // Save order locally with confirmation
    const price = getPrice(item, parsed.quantity);
    const order = {
      id: Date.now(),
      name: item.name,
      quantity: parsed.quantity,
      unit: item.unit,
      price,
      status: 'confirmed',
      remoteOrderId: receipt.orderNumber,
      confirmationUrl: receipt.confirmationUrl,
      placedAt: new Date().toISOString()
    };
    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);
  } catch (err) {
    console.error('Remote order failed: ' + err.message);
    console.log('Falling back to local order...');
    placeOrderLocal(data, item, parsed.quantity);
  }
}
function viewOrders(limit) {
  const orders = loadOrders();
  if (!orders.length) { console.log('No orders yet.'); return; }
  const list = limit ? orders.slice(-limit) : orders;
  console.log(`Orders (${list.length}/${orders.length}):`);
  list.forEach(o => {
    const d = new Date(o.placedAt).toLocaleDateString();
    const p = o.price != null ? formatPrice(o.price) : '—';
    const name = o.name || 'Unknown Item';
    const unit = o.unit || 'g';
    console.log(`  [${o.status.toUpperCase()}] ${d} - ${o.quantity}${unit} ${name} @ ${p}`);
  });
}
function useItem(data, itemArgs, qty) {
  let item;
  if (!itemArgs.length) {
    const lastUse = [...data.history].reverse().find(h => h.action === 'use');
    if (!lastUse) { console.error('No previous session. Specify an item.'); process.exit(1); }
    const lastName = getDisplayName(lastUse);
    item = data.inventory.find(i => i.name.toLowerCase() === lastName.toLowerCase());
    if (!item) { console.error(`Last used item "${lastName}" is out of stock.`); process.exit(1); }
  } else {
    item = resolveItem(data, itemArgs);
  }
  if (item.quantity < qty) { console.error(`Not enough. Have ${item.quantity}${item.unit}, session size is ${qty}${item.unit}.`); process.exit(1); }
  item.quantity = round1(item.quantity - qty);
  data.history.push({ action: 'use', name: item.name, quantity: qty, unit: item.unit, timestamp: new Date().toISOString() });
  if (item.quantity === 0) {
    data.inventory = data.inventory.filter(i => i !== item);
    console.log(`Used ${qty}${item.unit} of ${item.name}. Now out of stock.`);
  } else {
    console.log(`Used ${qty}${item.unit} of ${item.name}. ${item.quantity}${item.unit} remaining.`);
  }
  saveData(data);
}
function removeStock(data, itemArgs, quantity) {
  const item = resolveItem(data, itemArgs);
  if (item.quantity < quantity) { console.error(`Not enough. Have ${item.quantity}${item.unit}, tried to remove ${quantity}${item.unit}.`); process.exit(1); }
  item.quantity = round1(item.quantity - quantity);
  data.history.push({ action: 'remove', name: item.name, quantity, unit: item.unit, timestamp: new Date().toISOString() });
  if (item.quantity === 0) {
    data.inventory = data.inventory.filter(i => i !== item);
    console.log(`Removed ${quantity}${item.unit} of ${item.name}. Now out of stock.`);
  } else {
    console.log(`Removed ${quantity}${item.unit} of ${item.name}. ${item.quantity}${item.unit} remaining.`);
  }
  saveData(data);
}
function deleteItem(data, itemArgs) {
  const item = resolveItem(data, itemArgs);
  data.inventory = data.inventory.filter(i => i !== item);
  data.history.push({ action: 'delete', name: item.name, quantity: item.quantity, unit: item.unit, timestamp: new Date().toISOString() });
  saveData(data);
  console.log(`Deleted ${item.name} (had ${item.quantity}${item.unit}).`);
}
function listInventory(data, category, showPriceTables = false) {
  const items = inventoryByCategory(data, category);
  if (!items.length) { console.log('Inventory is empty.'); return; }
  const categories = [...new Set(items.map(item => item.category))];
  let grandCount = 0;
  categories.forEach(cat => {
    const group = items.filter(item => item.category === cat);
    grandCount += group.length;
    console.log(`=== ${cat.toUpperCase()} ===`);
    group.forEach(item => {
      const pgPrice = item.prices?.perGram != null ? ` · ${formatPrice(item.prices.perGram)}/g` : '';
      const bagPrices = item.prices?.bags ? Object.entries(item.prices.bags) : [];
      const bagStr = bagPrices.length ? ` · bags: ${bagPrices.map(([g, p]) => `${g}${item.unit}=${formatPrice(p)}`).join(', ')}` : '';
      console.log(`- ${item.name}: ${item.quantity} ${item.unit}${formatMeta(item)}${pgPrice}${bagStr}`);
      if (showPriceTables && (item.prices?.perGram != null || bagPrices.length)) console.log(bagPriceTable(item));
    });
    console.log(`${group.length} items · ${categoryTotals(group)}${group[0]?.unit || ''} total\n`);
  });
  console.log(`Grand total: ${grandCount} items · ${summarizeTotalsByUnit(items)}`);
}
function showCategories(data) {
  const groups = new Map();
  data.inventory.forEach(item => {
    const group = groups.get(item.category) || { count: 0, total: 0, unit: item.unit };
    group.count += 1;
    group.total = round1(group.total + item.quantity);
    groups.set(item.category, group);
  });
  if (!groups.size) { console.log('No categories with inventory.'); return; }
  [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([category, info]) => {
    console.log(`${category}: ${info.count} items (${info.total}${info.unit})`);
  });
}
function browseCategories(cfg, category) {
  if (category) {
    const cat = getCategoryConfig(cfg, category);
    if (!cat) { console.error(`Unknown category: ${category}`); process.exit(1); }
    console.log(`${category.toUpperCase()}:`);
    console.log(`  ${cat.subcategories.join(' | ') || '(no subcategories)'}`);
    return;
  }
  Object.entries(cfg.categories).forEach(([name, info]) => {
    console.log(`${name.toUpperCase()}:`);
    console.log(`  ${info.subcategories.join(' | ') || '(no subcategories)'}`);
  });
}
function findItems(data, query) {
  const q = query.toLowerCase();
  const matches = data.inventory.filter(i => i.name.toLowerCase().includes(q));
  if (!matches.length) { console.log(`No items matching "${query}".`); return; }
  matches.forEach(item => {
    const pgPrice = item.prices?.perGram != null ? ` · ${formatPrice(item.prices.perGram)}/g` : '';
    console.log(`- ${item.name} [${item.category}]: ${item.quantity}${item.unit}${formatMeta(item)}${pgPrice}`);
    if (item.prices?.bags) {
      Object.entries(item.prices.bags).forEach(([g, p]) => console.log(`  ${g}${item.unit} bag = ${formatPrice(p)}`));
    }
  });
}
function showStats(data, category) {
  const items = category ? data.inventory.filter(i => i.category === category) : data.inventory;
  const history = category
    ? data.history.filter(h => {
      const name = getDisplayName(h).toLowerCase();
      return items.some(i => i.name.toLowerCase() === name);
    })
    : data.history;
  const totalQty = round1(items.reduce((s, i) => s + i.quantity, 0));
  const used = round1(history.filter(h => h.action === 'use').reduce((s, h) => s + h.quantity, 0));
  const added = round1(history.filter(h => h.action === 'add').reduce((s, h) => s + h.quantity, 0));
  const sessions = history.filter(h => h.action === 'use').length;
  const firstTx = history[0];
  const daysSinceFirst = firstTx ? Math.floor((Date.now() - new Date(firstTx.timestamp)) / 86400000) : 0;
  const lastTx = history[history.length - 1];
  const orders = loadOrders();
  const totalSpent = orders.filter(o => o.price != null).reduce((s, o) => s + o.price, 0);
  console.log(category ? `Stats for ${category}:` : 'Stats:');
  console.log(`  Items tracked: ${items.length}`);
  console.log(`  Total inventory: ${totalQty}`);
  console.log(`  Total added (all time): ${added}`);
  console.log(`  Total consumed: ${used} (${sessions} sessions)`);
  console.log(`  Days active: ${daysSinceFirst}`);
  console.log(`  Orders placed: ${orders.length} · Total spent: ${formatPrice(totalSpent)}`);
  if (lastTx) console.log(`  Last action: ${lastTx.action} ${lastTx.quantity}${getHistoryUnit(lastTx, data)} of ${getDisplayName(lastTx)}`);

  if (!category) {
    console.log('\nPer-category breakdown:');
    const grouped = new Map();
    data.inventory.forEach(item => {
      const entry = grouped.get(item.category) || { count: 0, total: 0, unit: item.unit };
      entry.count += 1;
      entry.total = round1(entry.total + item.quantity);
      grouped.set(item.category, entry);
    });
    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([cat, info]) => {
      console.log(`  ${cat}: ${info.count} items (${info.total}${info.unit})`);
    });
  }
}
function showLog(data, limit) {
  if (!data.history.length) { console.log('No history yet.'); return; }
  const entries = limit ? data.history.slice(-limit) : data.history;
  console.log(`History (${entries.length}/${data.history.length}):`);
  entries.forEach(e => {
    const d = new Date(e.timestamp).toLocaleDateString();
    console.log(`- ${d}: ${e.action} ${e.quantity}${getHistoryUnit(e, data)} of ${getDisplayName(e)}`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cfg = loadConfig();
  const data = loadData(cfg);
  const command = args[0] || 'list';
  const rest = args.slice(1);

  checkAuth(command, process.argv.slice(2));
  const cleanRest = stripAuthFlags(rest);

  switch (command) {
    case 'list': {
      const showPrices = cleanRest.includes('--prices');
      const category = cleanRest.find(arg => !arg.startsWith('--')) || null;
      if (category && !getCategoryConfig(cfg, category)) { console.error(`Unknown category: ${category}`); process.exit(1); }
      listInventory(data, category, showPrices);
      break;
    }
    case 'categories':
      showCategories(data);
      break;
    case 'browse': {
      const live = cleanRest.includes('--live');
      const category = cleanRest.find(arg => !arg.startsWith('--')) || null;
      if (live) {
        if (!category) { console.error('Usage: weed browse <category> --live'); process.exit(1); }
        const { scrapeLiveCategory } = await import('./scraper.js');
        await scrapeLiveCategory(category);
      } else {
        browseCategories(cfg, category);
      }
      break;
    }
    case 'find':
    case 'search':
      if (!cleanRest.length) { console.error('Usage: weed find <query>'); process.exit(1); }
      findItems(data, cleanRest.join(' '));
      break;
    case 'log':
      showLog(data, cleanRest[0] ? parseInt(cleanRest[0], 10) : null);
      break;
    case 'stats': {
      const category = cleanRest[0] || null;
      if (category && !getCategoryConfig(cfg, category)) { console.error(`Unknown category: ${category}`); process.exit(1); }
      showStats(data, category);
      break;
    }
    case 'add': {
      const parsed = parseAddArgs(cleanRest, cfg);
      if (!parsed || parsed.rest.length) {
        console.error('Usage: weed add <name> <qty> [--cat <category>] [--sub <subcategory>] [--vendor <vendor>] [--url <url>]');
        process.exit(1);
      }
      addItem(data, cfg, parsed.name, parsed.quantity, {
        category: parsed.category,
        subcategory: parsed.subcategory,
        vendor: parsed.vendor,
        url: parsed.url
      });
      break;
    }
    case 'remove': {
      const parsed = parseNameQtyArgs(cleanRest);
      if (!parsed || parsed.rest.length) { console.error('Usage: weed remove <name> <qty>'); process.exit(1); }
      removeStock(data, [parsed.name], parsed.quantity);
      break;
    }
    case 'use':
    case 'consume': {
      const parsed = parseNameQtyArgs(cleanRest);
      if (parsed && !parsed.rest.length) {
        useItem(data, [parsed.name], parsed.quantity);
      } else if (cleanRest.length) {
        useItem(data, [cleanRest.join(' ')], cfg.sessionSize);
      } else {
        useItem(data, [], cfg.sessionSize);
      }
      break;
    }
    case 'delete':
    case 'drop':
      if (!cleanRest.length) { console.error('Usage: weed delete <name>'); process.exit(1); }
      deleteItem(data, [cleanRest.join(' ')]);
      break;
    case 'price':
      if (!cleanRest.length) { console.error('Usage: weed price <name> <$/g>'); process.exit(1); }
      setPrice(data, cleanRest);
      break;
    case 'order':
      if (!cleanRest.length) { console.error('Usage: weed order <name> <qty> [--local]'); process.exit(1); }
      await placeOrder(data, cleanRest);
      break;
    case 'confirm': {
      if (!cleanRest.length) { console.error('Usage: weed confirm <url|order-id>'); process.exit(1); }
      const target = cleanRest.join(' ');
      let confirmUrl;
      if (target.startsWith('http')) {
        confirmUrl = target;
      } else {
        const orders = loadOrders();
        const match = orders.find(o => String(o.id) === target || String(o.remoteOrderId) === target);
        if (!match || !match.confirmationUrl) {
          console.error(`No confirmation URL found for order: ${target}`);
          process.exit(1);
        }
        confirmUrl = match.confirmationUrl;
      }
      const { scrapeConfirmation } = await import('./scraper.js');
      const receipt = await scrapeConfirmation(confirmUrl);
      printReceipt(receipt);
      break;
    }
    case 'orders':
      if (cleanRest[0] === '--remote') {
        const id = cleanRest[1];
        if (id) {
          const { fetchOrderDetails } = await import('./scraper.js');
          await fetchOrderDetails(id);
        } else {
          const { fetchRemoteOrders } = await import('./scraper.js');
          await fetchRemoteOrders();
        }
      } else {
        viewOrders(cleanRest[0] ? parseInt(cleanRest[0], 10) : null);
      }
      break;
    case 'login': {
      const { login } = await import('./scraper.js');
      await login();
      break;
    }
    case 'account': {
      const { showAccount } = await import('./scraper.js');
      await showAccount();
      break;
    }
    case 'config':
      if (cleanRest[0] === 'session' && cleanRest[1]) {
        const size = Number(cleanRest[1]);
        if (!Number.isFinite(size) || size <= 0) { console.error('Invalid session size'); process.exit(1); }
        cfg.sessionSize = size;
        saveConfig(cfg);
        console.log(`Default session size set to ${size}g.`);
      } else if (cleanRest[0] === 'url' && cleanRest[1]) {
        cfg.rootUrl = cleanRest[1];
        saveConfig(cfg);
        console.log(`Root URL set to ${cfg.rootUrl}`);
      } else {
        console.log(`Current config: session size = ${cfg.sessionSize}g`);
        console.log(`Current root URL: ${cfg.rootUrl}`);
      }
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

await main();
