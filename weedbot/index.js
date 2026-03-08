import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data.json');
const backupPath = path.join(__dirname, 'data.backup.json');
const configPath = path.join(__dirname, 'config.json');

// --- Config ---
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { sessionSize: 0.3 }; // default session size in grams
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

// --- Data ---
function loadData() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.history)) {
      return { inventory: [], history: [] };
    }
    return parsed;
  } catch {
    return { inventory: [], history: [] };
  }
}

function saveData(data) {
  if (fs.existsSync(dataPath)) {
    fs.copyFileSync(dataPath, backupPath);
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// --- Fuzzy match ---
// Levenshtein distance for typo tolerance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function fuzzyFind(inventory, query) {
  const q = query.toLowerCase();
  // Exact match first
  const exact = inventory.find(i => i.strain.toLowerCase() === q);
  if (exact) return exact;
  // Substring match
  const sub = inventory.filter(i => i.strain.toLowerCase().includes(q));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) return { ambiguous: true, matches: sub };
  // Fuzzy (levenshtein <= 2)
  const scored = inventory
    .map(i => ({ item: i, dist: levenshtein(i.strain.toLowerCase(), q) }))
    .filter(x => x.dist <= 2)
    .sort((a, b) => a.dist - b.dist);
  if (scored.length === 1) return scored[0].item;
  if (scored.length > 1) return { ambiguous: true, matches: scored.map(x => x.item) };
  return null;
}

// --- Arg parsing ---
function parseStrainAndQuantity(args) {
  if (args.length < 2) return null;
  const last = args[args.length - 1];
  const qty = Number(last);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { strain: args.slice(0, -1).join(' '), quantity: qty };
}

function round1(n) { return Math.round(n * 10) / 10; }

// --- Commands ---
function printUsage() {
  console.log('Usage:');
  console.log('  weed [list]                    - inventory');
  console.log('  weed stats                     - summary');
  console.log('  weed log [n]                   - history (last n)');
  console.log('  weed find <query>              - search strains');
  console.log('  weed add <strain> <qty>        - add stock (g)');
  console.log('  weed remove <strain> <qty>     - reduce stock (g)');
  console.log('  weed use [strain] [qty]        - log session (default qty from config)');
  console.log('  weed delete <strain>           - remove strain entirely');
  console.log('  weed config session <qty>      - set default session size');
  console.log('');
  console.log('Strain names with spaces work: weed add Blue Dream 3.5');
}

function resolveStrain(data, nameArgs) {
  const query = nameArgs.join(' ');
  const result = fuzzyFind(data.inventory, query);
  if (!result) {
    console.error(`Strain not found: "${query}"`);
    process.exit(1);
  }
  if (result.ambiguous) {
    console.error(`Ambiguous strain "${query}". Did you mean:`);
    result.matches.forEach(m => console.error(`  - ${m.strain}`));
    process.exit(1);
  }
  return result;
}

function addStrain(data, strain, quantity) {
  const existing = data.inventory.find(i => i.strain.toLowerCase() === strain.toLowerCase());
  if (existing) {
    existing.quantity = round1(existing.quantity + quantity);
  } else {
    data.inventory.push({ strain, quantity, dateAdded: new Date().toISOString() });
  }
  data.history.push({ action: 'add', strain, quantity, timestamp: new Date().toISOString() });
  saveData(data);
  const now = existing ? existing.quantity : quantity;
  console.log(`Added ${quantity}g of ${strain}. Now have ${now.toFixed(1)}g.`);
}

function useStrain(data, strainArgs, qty) {
  // If no strain given, pick the last used strain
  let item;
  if (!strainArgs.length) {
    const lastUse = [...data.history].reverse().find(h => h.action === 'use');
    if (!lastUse) {
      console.error('No previous session. Specify a strain.');
      process.exit(1);
    }
    item = data.inventory.find(i => i.strain.toLowerCase() === lastUse.strain.toLowerCase());
    if (!item) {
      console.error(`Last used strain "${lastUse.strain}" is out of stock.`);
      process.exit(1);
    }
  } else {
    item = resolveStrain(data, strainArgs);
  }

  if (item.quantity < qty) {
    console.error(`Not enough. Have ${item.quantity}g, session size is ${qty}g.`);
    process.exit(1);
  }

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
  if (item.quantity < quantity) {
    console.error(`Not enough. Have ${item.quantity}g, tried to remove ${quantity}g.`);
    process.exit(1);
  }
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

function listInventory(data) {
  if (!data.inventory.length) { console.log('Inventory is empty.'); return; }
  const total = round1(data.inventory.reduce((s, i) => s + i.quantity, 0));
  console.log('Current inventory:');
  data.inventory.forEach(item => console.log(`- ${item.strain}: ${item.quantity}g`));
  console.log(`\n${data.inventory.length} strains · ${total}g total`);
}

function findStrain(data, query) {
  const q = query.toLowerCase();
  const matches = data.inventory.filter(i => i.strain.toLowerCase().includes(q));
  if (!matches.length) { console.log(`No strains matching "${query}".`); return; }
  matches.forEach(item => console.log(`- ${item.strain}: ${item.quantity}g`));
}

function showStats(data) {
  const totalGrams = round1(data.inventory.reduce((s, i) => s + i.quantity, 0));
  const used = round1(data.history.filter(h => h.action === 'use').reduce((s, h) => s + h.quantity, 0));
  const added = round1(data.history.filter(h => h.action === 'add').reduce((s, h) => s + h.quantity, 0));
  const sessions = data.history.filter(h => h.action === 'use').length;
  const firstTx = data.history[0];
  const daysSinceFirst = firstTx ? Math.floor((Date.now() - new Date(firstTx.timestamp)) / 86400000) : 0;
  const lastTx = data.history[data.history.length - 1];
  console.log('Stats:');
  console.log(`  Strains tracked: ${data.inventory.length}`);
  console.log(`  Total inventory: ${totalGrams}g`);
  console.log(`  Total added (all time): ${added}g`);
  console.log(`  Total consumed: ${used}g (${sessions} sessions)`);
  console.log(`  Days active: ${daysSinceFirst}`);
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

  switch (command) {
    case 'list': listInventory(data); break;

    case 'find': case 'search':
      if (!rest.length) { console.error('Usage: weed find <query>'); process.exit(1); }
      findStrain(data, rest.join(' '));
      break;

    case 'log': {
      const limit = rest[0] ? parseInt(rest[0]) : null;
      showLog(data, limit);
      break;
    }

    case 'stats': showStats(data); break;

    case 'add': {
      const parsed = parseStrainAndQuantity(rest);
      if (!parsed) { console.error('Usage: weed add <strain> <qty>'); process.exit(1); }
      addStrain(data, parsed.strain, parsed.quantity);
      break;
    }

    case 'remove': {
      const parsed = parseStrainAndQuantity(rest);
      if (!parsed) { console.error('Usage: weed remove <strain> <qty>'); process.exit(1); }
      removeStock(data, [parsed.strain], parsed.quantity);
      break;
    }

    case 'use': case 'consume': {
      // Try to parse qty from end of args
      const parsed = rest.length ? parseStrainAndQuantity(rest) : null;
      if (parsed) {
        useStrain(data, [parsed.strain], parsed.quantity);
      } else if (rest.length) {
        // Strain given, no qty — use session default
        useStrain(data, rest, cfg.sessionSize);
      } else {
        // No args — use last strain, session default
        useStrain(data, [], cfg.sessionSize);
      }
      break;
    }

    case 'delete': case 'drop':
      if (!rest.length) { console.error('Usage: weed delete <strain>'); process.exit(1); }
      deleteStrain(data, rest);
      break;

    case 'config': {
      if (rest[0] === 'session' && rest[1]) {
        const size = Number(rest[1]);
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
