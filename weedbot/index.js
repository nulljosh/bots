import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data.json');
const backupPath = path.join(__dirname, 'data.backup.json');

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
  // Backup before write
  if (fs.existsSync(dataPath)) {
    fs.copyFileSync(dataPath, backupPath);
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Parse args: everything before the last token that looks like a number is the strain name
function parseStrainAndQuantity(args) {
  if (args.length < 2) return null;
  const last = args[args.length - 1];
  const qty = Number(last);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const strain = args.slice(0, -1).join(' ');
  return { strain, quantity: qty };
}

function printUsage() {
  console.log('Usage:');
  console.log('  weed [list]               - show inventory');
  console.log('  weed stats                - summary stats');
  console.log('  weed log                  - full history');
  console.log('  weed find <query>         - search strains');
  console.log('  weed add <strain> <qty>   - add stock (g)');
  console.log('  weed remove <strain> <qty> - remove stock (g)');
  console.log('  weed use <strain> <qty>   - log consumption (g)');
  console.log('  weed delete <strain>      - remove strain entirely');
  console.log('');
  console.log('Strain names with spaces work: weed add Blue Dream 3.5');
}

function addStrain(data, strain, quantity) {
  const existing = data.inventory.find((item) => item.strain.toLowerCase() === strain.toLowerCase());

  if (existing) {
    existing.quantity += quantity;
    existing.quantity = Math.round(existing.quantity * 10) / 10;
  } else {
    data.inventory.push({ strain, quantity, dateAdded: new Date().toISOString() });
  }

  data.history.push({ action: 'add', strain, quantity, timestamp: new Date().toISOString() });
  saveData(data);
  console.log(`Added ${quantity}g of ${strain}. Now have ${(existing ? existing.quantity : quantity).toFixed(1)}g.`);
}

function removeStrain(data, strain, quantity, action = 'remove') {
  const existing = data.inventory.find((item) => item.strain.toLowerCase() === strain.toLowerCase());

  if (!existing) {
    console.error(`Strain not found: ${strain}`);
    process.exit(1);
  }

  if (existing.quantity < quantity) {
    console.error(`Not enough. Have ${existing.quantity}g, tried to ${action} ${quantity}g.`);
    process.exit(1);
  }

  existing.quantity -= quantity;
  existing.quantity = Math.round(existing.quantity * 10) / 10;

  if (existing.quantity === 0) {
    data.inventory = data.inventory.filter((item) => item !== existing);
    console.log(`${action === 'use' ? 'Used' : 'Removed'} ${quantity}g of ${strain}. Now out of stock.`);
  } else {
    console.log(`${action === 'use' ? 'Used' : 'Removed'} ${quantity}g of ${strain}. ${existing.quantity}g remaining.`);
  }

  data.history.push({ action, strain, quantity, timestamp: new Date().toISOString() });
  saveData(data);
}

function deleteStrain(data, strainArgs) {
  const strain = strainArgs.join(' ');
  const idx = data.inventory.findIndex((item) => item.strain.toLowerCase() === strain.toLowerCase());
  if (idx === -1) {
    console.error(`Strain not found: ${strain}`);
    process.exit(1);
  }
  const removed = data.inventory.splice(idx, 1)[0];
  data.history.push({ action: 'delete', strain: removed.strain, quantity: removed.quantity, timestamp: new Date().toISOString() });
  saveData(data);
  console.log(`Deleted ${removed.strain} (had ${removed.quantity}g).`);
}

function listInventory(data) {
  if (data.inventory.length === 0) {
    console.log('Inventory is empty.');
    return;
  }
  const total = data.inventory.reduce((s, i) => s + i.quantity, 0);
  console.log('Current inventory:');
  data.inventory.forEach((item) => {
    console.log(`- ${item.strain}: ${item.quantity}g`);
  });
  console.log(`\n${data.inventory.length} strains · ${Math.round(total * 10) / 10}g total`);
}

function findStrain(data, query) {
  const q = query.toLowerCase();
  const matches = data.inventory.filter((item) => item.strain.toLowerCase().includes(q));
  if (matches.length === 0) {
    console.log(`No strains matching "${query}".`);
    return;
  }
  matches.forEach((item) => console.log(`- ${item.strain}: ${item.quantity}g`));
}

function showStats(data) {
  const totalStrains = data.inventory.length;
  const totalGrams = Math.round(data.inventory.reduce((s, i) => s + i.quantity, 0) * 10) / 10;
  const used = data.history.filter(h => h.action === 'use').reduce((s, h) => s + h.quantity, 0);
  const added = data.history.filter(h => h.action === 'add').reduce((s, h) => s + h.quantity, 0);
  const lastTx = data.history.length > 0 ? data.history[data.history.length - 1] : null;
  const firstTx = data.history.length > 0 ? data.history[0] : null;
  const daysSinceFirst = firstTx
    ? Math.floor((Date.now() - new Date(firstTx.timestamp).getTime()) / 86400000)
    : 0;

  console.log('Stats:');
  console.log(`  Strains tracked: ${totalStrains}`);
  console.log(`  Total inventory: ${totalGrams}g`);
  console.log(`  Total added (all time): ${Math.round(added * 10) / 10}g`);
  console.log(`  Total consumed: ${Math.round(used * 10) / 10}g`);
  console.log(`  Days active: ${daysSinceFirst}`);
  if (lastTx) {
    console.log(`  Last action: ${lastTx.action} ${lastTx.quantity}g of ${lastTx.strain}`);
  }
}

function showLog(data, limit) {
  if (data.history.length === 0) {
    console.log('No history yet.');
    return;
  }
  const entries = limit ? data.history.slice(-limit) : data.history;
  console.log(`History (${entries.length}/${data.history.length} entries):`);
  entries.forEach((entry) => {
    const d = new Date(entry.timestamp).toLocaleDateString();
    console.log(`- ${d}: ${entry.action} ${entry.quantity}g of ${entry.strain}`);
  });
}

function main() {
  const args = process.argv.slice(2);
  const data = loadData();
  const command = args[0] || 'list';
  const rest = args.slice(1);

  switch (command) {
    case 'list':
      listInventory(data);
      break;

    case 'find':
    case 'search': {
      if (!rest.length) { console.error('Usage: weed find <query>'); process.exit(1); }
      findStrain(data, rest.join(' '));
      break;
    }

    case 'log': {
      const limit = rest[0] ? parseInt(rest[0]) : null;
      showLog(data, limit);
      break;
    }

    case 'stats':
      showStats(data);
      break;

    case 'add': {
      const parsed = parseStrainAndQuantity(rest);
      if (!parsed) { console.error('Usage: weed add <strain> <quantity>'); process.exit(1); }
      addStrain(data, parsed.strain, parsed.quantity);
      break;
    }

    case 'remove': {
      const parsed = parseStrainAndQuantity(rest);
      if (!parsed) { console.error('Usage: weed remove <strain> <quantity>'); process.exit(1); }
      removeStrain(data, parsed.strain, parsed.quantity, 'remove');
      break;
    }

    case 'use':
    case 'consume': {
      const parsed = parseStrainAndQuantity(rest);
      if (!parsed) { console.error('Usage: weed use <strain> <quantity>'); process.exit(1); }
      removeStrain(data, parsed.strain, parsed.quantity, 'use');
      break;
    }

    case 'delete':
    case 'drop': {
      if (!rest.length) { console.error('Usage: weed delete <strain>'); process.exit(1); }
      deleteStrain(data, rest);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
