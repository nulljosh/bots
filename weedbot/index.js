import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data.json');

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
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function printUsage() {
  console.log('Usage:');
  console.log("  node index.js add <strain> <quantity>");
  console.log("  node index.js remove <strain> <quantity>");
  console.log('  node index.js list');
  console.log('  node index.js log');
}

function addStrain(data, strain, quantity) {
  const existing = data.inventory.find((item) => item.strain.toLowerCase() === strain.toLowerCase());

  if (existing) {
    existing.quantity += quantity;
  } else {
    data.inventory.push({
      strain,
      quantity,
      dateAdded: new Date().toISOString()
    });
  }

  data.history.push({
    action: 'add',
    strain,
    quantity,
    timestamp: new Date().toISOString()
  });

  saveData(data);
  console.log(`Added ${quantity}g of ${strain}.`);
}

function removeStrain(data, strain, quantity) {
  const existing = data.inventory.find((item) => item.strain.toLowerCase() === strain.toLowerCase());

  if (!existing) {
    console.error(`Strain not found: ${strain}`);
    process.exit(1);
  }

  if (existing.quantity < quantity) {
    console.error(`Not enough quantity to remove. Current: ${existing.quantity}g`);
    process.exit(1);
  }

  existing.quantity -= quantity;

  if (existing.quantity === 0) {
    data.inventory = data.inventory.filter((item) => item !== existing);
  }

  data.history.push({
    action: 'remove',
    strain,
    quantity,
    timestamp: new Date().toISOString()
  });

  saveData(data);
  console.log(`Removed ${quantity}g of ${strain}.`);
}

function listInventory(data) {
  if (data.inventory.length === 0) {
    console.log('Inventory is empty.');
    return;
  }

  console.log('Current inventory:');
  data.inventory.forEach((item) => {
    console.log(`- ${item.strain}: ${item.quantity}g (added ${item.dateAdded})`);
  });
}

function showLog(data) {
  if (data.history.length === 0) {
    console.log('No history yet.');
    return;
  }

  console.log('History:');
  data.history.forEach((entry) => {
    console.log(`- ${entry.timestamp}: ${entry.action} ${entry.quantity}g of ${entry.strain}`);
  });
}

function main() {
  const [, , command, strainArg, quantityArg] = process.argv;
  const data = loadData();

  if (!command) {
    printUsage();
    process.exit(1);
  }

  if (command === 'list') {
    listInventory(data);
    return;
  }

  if (command === 'log') {
    showLog(data);
    return;
  }

  if (command === 'add' || command === 'remove') {
    if (!strainArg || quantityArg === undefined) {
      printUsage();
      process.exit(1);
    }

    const quantity = Number(quantityArg);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      console.error('Quantity must be a positive number.');
      process.exit(1);
    }

    if (command === 'add') {
      addStrain(data, strainArg, quantity);
    } else {
      removeStrain(data, strainArg, quantity);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main();
