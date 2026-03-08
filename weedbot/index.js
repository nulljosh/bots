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

// Standard bag sizes (g)
const BAG_SIZES = [1, 3.5, 7, 14, 28];

// --- Auth ---
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
  const ui = args.indexOf('--user'), pi = args.indexOf('--pin');
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
    if (args[i] === '--user' || args[i] === '--pin') { i++; } else { out.push(args[i]); }
  }
  return out;
}

// --- Config ---
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return { sessionSize: 0.3 }; }
}
function saveConfig(cfg) { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2)); }

// --- Data ---
function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.history)) return { inventory: [], history: [] };
    return parsed;
  } catch { return { inventory: [], history: [] }; }
}
function saveData(data) {
  if (fs.existsSync(dataPath)) fs.copyFileSync(dataPath, backupPath);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// --- Orders ---
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ordersPath, 'utf8')); }
  catch { return []; }
}
function saveOrders(orders) { fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2)); }

// --- Fuzzy ---
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
function fuzzyFind(inventory, query) {
  const q = query.toLowerCase();
  const exact = inventory.find(i => i.strain.toLowerCase() === q);
  if (exact) return exact;
  const sub = inventory.filter(i => i.strain.toLowerCase().includes(q));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) return { ambiguous: true, matches: sub };
  const scored = inventory.map(i => ({ item: i, dist: levenshtein(i.strain.toLowerCase(), q) })).filter(x => x.dist <= 2).sort((a, b) => a.dist - b.dist);
  if (scored.length === 1) return scored[0].item;
  if (scored.length > 1) return { ambiguous: true, matches: scored.map(x => x.item) };
  return null;
}
function resolveStrain(data, nameArgs) {
  const query = nameArgs.join(' ');
  const result = fuzzyFind(data.inventory, query);
  if (!result) { console.error(`Strain not found: "${query}"`); process.exit(1); }
  if (result.ambiguous) { console.error(`Ambiguous: "${query}". Did you mean:\n${result.matches.map(m => '  - ' + m.strain).join('\n')}`); process.exit(1); }
  return result;
}

// --- Pricing helpers ---
function round1(n) { return Math.round(n * 10) / 10; }
function formatPrice(n) { return n != null ? `$${n.toFixed(2)}` : '—'; }

// Get price for a given quantity: check bag prices first, then fall back to per-gram
function getPrice(item, qty) {
  const prices = item.prices || {};
  // Exact bag size match
  if (prices.bags && prices.bags[String(qty)] != null) return prices.bags[String(qty)];
  // Per-gram fallback
  if (prices.perGram != null) return round1(prices.perGram * qty * 100) / 100;
  return null;
}

function bagPriceTable(item) {
  const prices = item.prices || {};
  const lines = [];
  for (const size of BAG_SIZES) {
    const p = getPrice(item, size);
    if (p != null) lines.push(`  ${size}g = ${formatPrice(p)}`);
  }
  if (prices.perGram != null) lines.push(`  Per gram: ${formatPrice(prices.perGram)}`);
  return lines.length ? lines.join('\n') : '  No prices set';
}

// --- Commands ---
function printUsage() {
  console.log('Usage:');
  console.log('  weed [list]                      - inventory (with prices)');
  console.log('  weed list --prices               - inventory with full price tables');
  console.log('  weed stats                       - summary');
  console.log('  weed log [n]                     - history');
  console.log('  weed find <query>                - search');
  console.log('  weed add <strain> <qty>          - add stock');
  console.log('  weed remove <strain> <qty>       - reduce stock');
  console.log('  weed use [strain] [qty]          - log session');
  console.log('  weed delete <strain>             - remove strain');
  console.log('  weed price <strain> <$/g>        - set per-gram price');
  console.log('  weed price <strain> bag <g> <$>  - set bag price');
  console.log('  weed order <strain> <qty>        - place order (logged locally)');
  console.log('  weed orders                      - view order history');
  console.log('  weed config session <qty>        - set default session size');
}

function addStrain(data, strain, quantity) {
  const existing = data.inventory.find(i => i.strain.toLowerCase() === strain.toLowerCase());
  if (existing) {
    existing.quantity = round1(existing.quantity + quantity);
  } else {
    data.inventory.push({ strain, quantity, prices: {}, dateAdded: new Date().toISOString() });
  }
  data.history.push({ action: 'add', strain, quantity, timestamp: new Date().toISOString() });
  saveData(data);
  const now = existing ? existing.quantity : quantity;
  console.log(`Added ${quantity}g of ${strain}. Now have ${now.toFixed(1)}g.`);
}

function setPrice(data, strainArgs) {
  // weed price <strain> <$/g>  OR  weed price <strain> bag <g> <$>
  const bagIdx = strainArgs.indexOf('bag');
  if (bagIdx !== -1) {
    // bag price mode: everything before 'bag' is strain, then size, then price
    const strainName = strainArgs.slice(0, bagIdx).join(' ');
    const size = Number(strainArgs[bagIdx + 1]);
    const price = Number(strainArgs[bagIdx + 2]);
    if (!strainName || !Number.isFinite(size) || !Number.isFinite(price)) {
      console.error('Usage: weed price <strain> bag <g> <$>'); process.exit(1);
    }
    const item = resolveStrain(data, [strainName]);
    item.prices = item.prices || {};
    item.prices.bags = item.prices.bags || {};
    item.prices.bags[String(size)] = price;
    saveData(data);
    console.log(`${item.strain}: ${size}g bag = ${formatPrice(price)}`);
  } else {
    // per-gram mode: last arg is price, rest is strain
    const price = Number(strainArgs[strainArgs.length - 1]);
    const strainName = strainArgs.slice(0, -1).join(' ');
    if (!strainName || !Number.isFinite(price)) {
      console.error('Usage: weed price <strain> <$/g>'); process.exit(1);
    }
    const item = resolveStrain(data, [strainName]);
    item.prices = item.prices || {};
    item.prices.perGram = price;
    saveData(data);
    console.log(`${item.strain}: ${formatPrice(price)}/g`);
  }
}

function placeOrder(data, strainArgs) {
  const parsed = strainArgs.length >= 2 ? (() => {
    const last = strainArgs[strainArgs.length - 1];
    const qty = Number(last);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    return { strain: strainArgs.slice(0, -1).join(' '), quantity: qty };
  })() : null;

  if (!parsed) { console.error('Usage: weed order <strain> <qty>'); process.exit(1); }

  const item = resolveStrain(data, [parsed.strain]);
  const price = getPrice(item, parsed.quantity);
  const order = {
    id: Date.now(),
    strain: item.strain,
    quantity: parsed.quantity,
    price,
    status: 'pending',
    placedAt: new Date().toISOString(),
  };

  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);

  console.log(`Order placed: ${parsed.quantity}g of ${item.strain}`);
  if (price != null) console.log(`  Price: ${formatPrice(price)}`);
  else console.log('  Price: not set for this quantity');
  console.log(`  Status: pending`);
  console.log(`  Order ID: ${order.id}`);
}

function viewOrders(limit) {
  const orders = loadOrders();
  if (!orders.length) { console.log('No orders yet.'); return; }
  const list = limit ? orders.slice(-limit) : orders;
  console.log(`Orders (${list.length}/${orders.length}):`);
  list.forEach(o => {
    const d = new Date(o.placedAt).toLocaleDateString();
    const p = o.price != null ? formatPrice(o.price) : '—';
    console.log(`  [${o.status.toUpperCase()}] ${d} — ${o.quantity}g ${o.strain} @ ${p}`);
  });
}

function useStrain(data, strainArgs, qty) {
  let item;
  if (!strainArgs.length) {
    const lastUse = [...data.history].reverse().find(h => h.action === 'use');
    if (!lastUse) { console.error('No previous session. Specify a strain.'); process.exit(1); }
    item = data.inventory.find(i => i.strain.toLowerCase() === lastUse.strain.toLowerCase());
    if (!item) { console.error(`Last used strain "${lastUse.strain}" is out of stock.`); process.exit(1); }
  } else {
    item = resolveStrain(data, strainArgs);
  }
  if (item.quantity < qty) { console.error(`Not enough. Have ${item.quantity}g, session size is ${qty}g.`); process.exit(1); }
  item.quantity = round1(item.quantity - qty);
  data.history.push({ action: 'use', strain: item.strain, quantity: qty, timestamp: new Date().toISOString() });
  if (item.quantity === 0) {
    data.inventory = data.inventory.filter(i => i !== item);
    console.log(`Used ${qty}g of ${item.strain}. Now out of stock.`);
  } else {
    console.log(`Used ${qty}g of ${item.strain}. ${item.quantity}g remaining.`);
  }
  saveData(data);
}

function removeStock(data, strainArgs, quantity) {
  const item = resolveStrain(data, strainArgs);
  if (item.quantity < quantity) { console.error(`Not enough. Have ${item.quantity}g, tried to remove ${quantity}g.`); process.exit(1); }
  item.quantity = round1(item.quantity - quantity);
  data.history.push({ action: 'remove', strain: item.strain, quantity, timestamp: new Date().toISOString() });
  if (item.quantity === 0) {
    data.inventory = data.inventory.filter(i => i !== item);
    console.log(`Removed ${quantity}g of ${item.strain}. Now out of stock.`);
  } else {
    console.log(`Removed ${quantity}g of ${item.strain}. ${item.quantity}g remaining.`);
  }
  saveData(data);
}

function deleteStrain(data, strainArgs) {
  const item = resolveStrain(data, strainArgs);
  data.inventory = data.inventory.filter(i => i !== item);
  data.history.push({ action: 'delete', strain: item.strain, quantity: item.quantity, timestamp: new Date().toISOString() });
  saveData(data);
  console.log(`Deleted ${item.strain} (had ${item.quantity}g).`);
}

function listInventory(data, showPriceTables = false) {
  if (!data.inventory.length) { console.log('Inventory is empty.'); return; }
  const total = round1(data.inventory.reduce((s, i) => s + i.quantity, 0));
  console.log('Current inventory:');
  data.inventory.forEach(item => {
    const pgPrice = item.prices?.perGram != null ? ` · ${formatPrice(item.prices.perGram)}/g` : '';
    // Show cheapest bag price available
    const bagPrices = item.prices?.bags ? Object.entries(item.prices.bags) : [];
    const bagStr = bagPrices.length ? ` · bags: ${bagPrices.map(([g, p]) => `${g}g=${formatPrice(p)}`).join(', ')}` : '';
    console.log(`- ${item.strain}: ${item.quantity}g${pgPrice}${bagStr}`);
    if (showPriceTables && (item.prices?.perGram != null || bagPrices.length)) {
      console.log(bagPriceTable(item));
    }
  });
  console.log(`\n${data.inventory.length} strains · ${total}g total`);
}

function findStrain(data, query) {
  const q = query.toLowerCase();
  const matches = data.inventory.filter(i => i.strain.toLowerCase().includes(q));
  if (!matches.length) { console.log(`No strains matching "${query}".`); return; }
  matches.forEach(item => {
    const pgPrice = item.prices?.perGram != null ? ` · ${formatPrice(item.prices.perGram)}/g` : '';
    console.log(`- ${item.strain}: ${item.quantity}g${pgPrice}`);
    if (item.prices?.bags) {
      Object.entries(item.prices.bags).forEach(([g, p]) => console.log(`  ${g}g bag = ${formatPrice(p)}`));
    }
  });
}

function showStats(data) {
  const totalGrams = round1(data.inventory.reduce((s, i) => s + i.quantity, 0));
  const used = round1(data.history.filter(h => h.action === 'use').reduce((s, h) => s + h.quantity, 0));
  const added = round1(data.history.filter(h => h.action === 'add').reduce((s, h) => s + h.quantity, 0));
  const sessions = data.history.filter(h => h.action === 'use').length;
  const firstTx = data.history[0];
  const daysSinceFirst = firstTx ? Math.floor((Date.now() - new Date(firstTx.timestamp)) / 86400000) : 0;
  const lastTx = data.history[data.history.length - 1];
  const orders = loadOrders();
  const totalSpent = orders.filter(o => o.price != null).reduce((s, o) => s + o.price, 0);
  console.log('Stats:');
  console.log(`  Strains tracked: ${data.inventory.length}`);
  console.log(`  Total inventory: ${totalGrams}g`);
  console.log(`  Total added (all time): ${added}g`);
  console.log(`  Total consumed: ${used}g (${sessions} sessions)`);
  console.log(`  Days active: ${daysSinceFirst}`);
  console.log(`  Orders placed: ${orders.length} · Total spent: ${formatPrice(totalSpent)}`);
  if (lastTx) console.log(`  Last action: ${lastTx.action} ${lastTx.quantity}g of ${lastTx.strain}`);
}

function showLog(data, limit) {
  if (!data.history.length) { console.log('No history yet.'); return; }
  const entries = limit ? data.history.slice(-limit) : data.history;
  console.log(`History (${entries.length}/${data.history.length}):`);
  entries.forEach(e => {
    const d = new Date(e.timestamp).toLocaleDateString();
    console.log(`- ${d}: ${e.action} ${e.quantity}g of ${e.strain}`);
  });
}

// --- Main ---
function main() {
  const args = process.argv.slice(2);
  const data = loadData();
  const cfg = loadConfig();
  const command = args[0] || 'list';
  const rest = args.slice(1);

  checkAuth(command, process.argv.slice(2));
  const cleanRest = stripAuthFlags(rest);

  switch (command) {
    case 'list': listInventory(data, cleanRest.includes('--prices')); break;
    case 'find': case 'search':
      if (!cleanRest.length) { console.error('Usage: weed find <query>'); process.exit(1); }
      findStrain(data, cleanRest.join(' '));
      break;
    case 'log': showLog(data, cleanRest[0] ? parseInt(cleanRest[0]) : null); break;
    case 'stats': showStats(data); break;
    case 'add': {
      const parsed = (() => {
        const last = cleanRest[cleanRest.length - 1];
        const qty = Number(last);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return { strain: cleanRest.slice(0, -1).join(' '), quantity: qty };
      })();
      if (!parsed) { console.error('Usage: weed add <strain> <qty>'); process.exit(1); }
      addStrain(data, parsed.strain, parsed.quantity);
      break;
    }
    case 'remove': {
      const last = cleanRest[cleanRest.length - 1];
      const qty = Number(last);
      if (!Number.isFinite(qty)) { console.error('Usage: weed remove <strain> <qty>'); process.exit(1); }
      removeStock(data, [cleanRest.slice(0, -1).join(' ')], qty);
      break;
    }
    case 'use': case 'consume': {
      const last = cleanRest[cleanRest.length - 1];
      const qty = Number(last);
      if (cleanRest.length >= 2 && Number.isFinite(qty)) {
        useStrain(data, [cleanRest.slice(0, -1).join(' ')], qty);
      } else if (cleanRest.length) {
        useStrain(data, cleanRest, cfg.sessionSize);
      } else {
        useStrain(data, [], cfg.sessionSize);
      }
      break;
    }
    case 'delete': case 'drop':
      if (!cleanRest.length) { console.error('Usage: weed delete <strain>'); process.exit(1); }
      deleteStrain(data, cleanRest);
      break;
    case 'price':
      if (!cleanRest.length) { console.error('Usage: weed price <strain> <$/g>'); process.exit(1); }
      setPrice(data, cleanRest);
      break;
    case 'order':
      if (!cleanRest.length) { console.error('Usage: weed order <strain> <qty>'); process.exit(1); }
      placeOrder(data, cleanRest);
      break;
    case 'orders': viewOrders(cleanRest[0] ? parseInt(cleanRest[0]) : null); break;
    case 'config': {
      if (cleanRest[0] === 'session' && cleanRest[1]) {
        const size = Number(cleanRest[1]);
        if (!Number.isFinite(size) || size <= 0) { console.error('Invalid session size'); process.exit(1); }
        cfg.sessionSize = size;
        saveConfig(cfg);
        console.log(`Default session size set to ${size}g.`);
      } else {
        console.log(`Current config: session size = ${cfg.sessionSize}g`);
      }
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
