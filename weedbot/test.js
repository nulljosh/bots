import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const realIndexPath = path.join(__dirname, 'index.js');
const realScraperPath = path.join(__dirname, 'scraper.js');
const realPackagePath = path.join(__dirname, 'package.json');

const tempDirs = [];

const defaultConfig = {
  sessionSize: 0.5,
  rootUrl: 'https://greenlandbotanicals.cc',
  categories: {
    flower: {
      unit: 'g',
      subcategories: ['indica', 'sativa', 'hybrid', 'pre-rolls', 'shake', 'popcorn', 'premium-aaaa', 'craft-exotics', 'wholesale', '99-ounces-and-under', 'aa']
    },
    extracts: {
      unit: 'g',
      subcategories: ['shatter', 'budder', 'live-resin', 'kief', 'hash', 'sauce', 'oils', 'thc-diamonds', 'crumble', 'rosin']
    },
    edibles: {
      unit: 'mg',
      subcategories: ['gummies', 'chocolate', 'cookies', 'syrup']
    },
    mushrooms: {
      unit: 'g',
      subcategories: ['dried', 'magic', 'edible', 'microdose', 'tea', 'tinctures']
    },
    vapes: {
      unit: 'unit',
      subcategories: ['disposable', 'cartridge', 'nicotine', 'battery']
    },
    nicotine: {
      unit: 'unit',
      subcategories: ['pouches', 'vapes', 'cigarettes']
    },
    accessories: {
      unit: 'unit',
      subcategories: ['pipes', 'health', 'snacks']
    }
  }
};

const defaultData = {
  inventory: [
    { name: 'OG Kush', quantity: 7, category: 'flower', unit: 'g', prices: {}, dateAdded: '2026-01-01T00:00:00.000Z' },
    {
      name: 'Bliss Gummies',
      quantity: 500,
      category: 'edibles',
      subcategory: 'gummies',
      vendor: 'Bliss',
      unit: 'mg',
      prices: {},
      dateAdded: '2026-01-02T00:00:00.000Z'
    }
  ],
  history: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSandbox({ data = defaultData, config = defaultConfig, orders = [], users, extraFiles } = {}) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.tmp-weedbot-test-'));
  tempDirs.push(dir);

  fs.copyFileSync(realIndexPath, path.join(dir, 'index.js'));
  fs.copyFileSync(realScraperPath, path.join(dir, 'scraper.js'));
  fs.copyFileSync(realPackagePath, path.join(dir, 'package.json'));

  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(clone(data), null, 2));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(clone(config), null, 2));
  fs.writeFileSync(path.join(dir, 'orders.json'), JSON.stringify(clone(orders), null, 2));
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify(users ?? { users: [], requireAuth: false, protectedCommands: [] }, null, 2));
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({}, null, 2));

  if (extraFiles) {
    for (const [name, contents] of Object.entries(extraFiles)) {
      fs.writeFileSync(path.join(dir, name), typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
    }
  }

  return dir;
}

async function runCli(dir, args) {
  try {
    const result = await execFileAsync(process.execPath, ['index.js', ...args], {
      cwd: dir,
      env: { ...process.env, TZ: 'UTC' }
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

function readJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function assertOk(result) {
  assert.equal(result.code, 0, `expected success, got ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertFail(result) {
  assert.notEqual(result.code, 0, `expected failure\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('list command', () => {
  it('lists all items grouped by category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['list']);
    assertOk(result);
    assert.match(result.stdout, /=== EDIBLES ===/);
    assert.match(result.stdout, /=== FLOWER ===/);
    assert.match(result.stdout, /Bliss Gummies: 500 mg/);
    assert.match(result.stdout, /OG Kush: 7 g/);
    assert.match(result.stdout, /Grand total: 2 items · (7g, 500mg|500mg, 7g)/);
  });

  it('filters by category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['list', 'flower']);
    assertOk(result);
    assert.match(result.stdout, /=== FLOWER ===/);
    assert.doesNotMatch(result.stdout, /=== EDIBLES ===/);
    assert.match(result.stdout, /OG Kush: 7 g/);
  });

  it('shows price tables with --prices', async () => {
    const data = clone(defaultData);
    data.inventory[0] = {
      ...data.inventory[0],
      name: 'OG Kush',
      category: 'flower',
      unit: 'g',
      prices: { perGram: 8, bags: { '3.5': 25, '7': 45 } }
    };
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['list', '--prices']);
    assertOk(result);
    assert.match(result.stdout, /bags: 7g=\$45\.00, 3\.5g=\$25\.00|bags: 3\.5g=\$25\.00, 7g=\$45\.00/);
    assert.match(result.stdout, /3\.5g = \$25\.00/);
    assert.match(result.stdout, /7g = \$45\.00/);
    assert.match(result.stdout, /Per gram: \$8\.00/);
  });

  it('shows empty inventory message', async () => {
    const dir = createSandbox({ data: { inventory: [], history: [] } });
    const result = await runCli(dir, ['list']);
    assertOk(result);
    assert.equal(result.stdout.trim(), 'Inventory is empty.');
  });

  it('rejects unknown category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['list', 'concentrates']);
    assertFail(result);
    assert.match(result.stderr, /Unknown category: concentrates/);
  });
});

describe('categories command', () => {
  it('shows category counts', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['categories']);
    assertOk(result);
    assert.match(result.stdout, /edibles: 1 items \(500mg\)/);
    assert.match(result.stdout, /flower: 1 items \(7g\)/);
  });

  it('shows empty message when no inventory', async () => {
    const dir = createSandbox({ data: { inventory: [], history: [] } });
    const result = await runCli(dir, ['categories']);
    assertOk(result);
    assert.equal(result.stdout.trim(), 'No categories with inventory.');
  });
});

describe('browse command', () => {
  it('shows all categories with subcategories', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['browse']);
    assertOk(result);
    assert.match(result.stdout, /FLOWER:/);
    assert.match(result.stdout, /indica \| sativa \| hybrid/);
    assert.match(result.stdout, /EDIBLES:/);
    assert.match(result.stdout, /gummies \| chocolate \| cookies \| syrup/);
  });

  it('shows single category subcategories', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['browse', 'edibles']);
    assertOk(result);
    assert.equal(result.stdout.trim(), 'EDIBLES:\n  gummies | chocolate | cookies | syrup');
  });

  it('rejects unknown category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['browse', 'drinks']);
    assertFail(result);
    assert.match(result.stderr, /Unknown category: drinks/);
  });
});

describe('add command', () => {
  it('adds new item with default flower category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'Blue', 'Dream', '3.5']);
    assertOk(result);
    assert.match(result.stdout, /Added 3\.5g of Blue Dream\. Now have 3\.5g\./);
    const data = readJson(dir, 'data.json');
    const item = data.inventory.find(entry => entry.name === 'Blue Dream');
    assert.equal(item.category, 'flower');
    assert.equal(item.unit, 'g');
  });

  it('adds item with --cat --sub --vendor flags', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'Live', 'Rosin', '2', '--cat', 'extracts', '--sub', 'rosin', '--vendor', 'SauceLab']);
    assertOk(result);
    assert.match(result.stdout, /Added 2g of Live Rosin\. Now have 2g\./);
    const data = readJson(dir, 'data.json');
    const item = data.inventory.find(entry => entry.name === 'Live Rosin');
    assert.equal(item.category, 'extracts');
    assert.equal(item.subcategory, 'rosin');
    assert.equal(item.vendor, 'SauceLab');
    assert.equal(item.unit, 'g');
  });

  it('increments existing item quantity', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'OG', 'Kush', '1.5']);
    assertOk(result);
    assert.match(result.stdout, /Added 1\.5g of OG Kush\. Now have 8\.5g\./);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.find(entry => entry.name === 'OG Kush').quantity, 8.5);
  });

  it('rejects unknown category', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'Mystery', '1', '--cat', 'drinks']);
    assertFail(result);
    assert.match(result.stderr, /Unknown category: drinks/);
  });

  it('rejects unknown subcategory', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'Mystery', '1', '--cat', 'edibles', '--sub', 'brownie']);
    assertFail(result);
    assert.match(result.stderr, /Unknown subcategory "brownie" for category "edibles"/);
  });
});

describe('remove command', () => {
  it('removes stock', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['remove', 'OG', 'Kush', '2']);
    assertOk(result);
    assert.match(result.stdout, /Removed 2g of OG Kush\. 5g remaining\./);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.find(entry => entry.name === 'OG Kush').quantity, 5);
  });

  it('errors when not enough stock', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['remove', 'OG', 'Kush', '10']);
    assertFail(result);
    assert.match(result.stderr, /Not enough\. Have 7g, tried to remove 10g\./);
  });

  it('removes item when quantity hits 0', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['remove', 'OG', 'Kush', '7']);
    assertOk(result);
    assert.match(result.stdout, /Removed 7g of OG Kush\. Now out of stock\./);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.some(entry => entry.name === 'OG Kush'), false);
  });
});

describe('use command', () => {
  it('uses default session size', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['use', 'OG', 'Kush']);
    assertOk(result);
    assert.match(result.stdout, /Used 0\.5g of OG Kush\. 6\.5g remaining\./);
  });

  it('uses specified quantity', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['use', 'OG', 'Kush', '1.2']);
    assertOk(result);
    assert.match(result.stdout, /Used 1\.2g of OG Kush\. 5\.8g remaining\./);
  });

  it('uses last used item when no name given', async () => {
    const data = clone(defaultData);
    data.history.push({
      action: 'use',
      name: 'OG Kush',

      quantity: 0.5,
      unit: 'g',
      timestamp: '2026-01-03T00:00:00.000Z'
    });
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['use']);
    assertOk(result);
    assert.match(result.stdout, /Used 0\.5g of OG Kush\. 6\.5g remaining\./);
  });
});

describe('delete command', () => {
  it('deletes item entirely', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['delete', 'Bliss', 'Gummies']);
    assertOk(result);
    assert.match(result.stdout, /Deleted Bliss Gummies \(had 500mg\)\./);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.some(entry => entry.name === 'Bliss Gummies'), false);
  });
});

describe('find command', () => {
  it('finds items by substring', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['find', 'Kush']);
    assertOk(result);
    assert.match(result.stdout, /- OG Kush \[flower\]: 7g/);
  });

  it('finds across categories', async () => {
    const data = clone(defaultData);
    data.inventory.push({
      name: 'Kush Cartridge',
      quantity: 1,
      category: 'vapes',
      subcategory: 'cartridge',
      vendor: 'Cloud9',
      unit: 'unit',
      prices: {},
      dateAdded: '2026-01-03T00:00:00.000Z',
      url: null
    });
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['find', 'Kush']);
    assertOk(result);
    assert.match(result.stdout, /- OG Kush \[flower\]: 7g/);
    assert.match(result.stdout, /- Kush Cartridge \[vapes\]: 1unit/);
  });

  it('shows no match message', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['find', 'Moonrocks']);
    assertOk(result);
    assert.equal(result.stdout.trim(), 'No items matching "Moonrocks".');
  });
});

describe('fuzzy matching via CLI', () => {
  it('matches exact names for commands that resolve items', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['price', 'OG', 'Kush', '12']);
    assertOk(result);
    assert.match(result.stdout, /OG Kush: \$12\.00\/g/);
  });

  it('matches levenshtein-close names', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['price', 'OG', 'Kushh', '9']);
    assertOk(result);
    assert.match(result.stdout, /OG Kush: \$9\.00\/g/);
  });

  it('reports ambiguous substring matches', async () => {
    const data = clone(defaultData);
    data.inventory.push({
      name: 'OG King',
      quantity: 4,
      category: 'flower',
      subcategory: 'hybrid',
      vendor: null,
      unit: 'g',
      prices: {},
      dateAdded: '2026-01-03T00:00:00.000Z',
      url: null
    });
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['price', 'OG', '8']);
    assertFail(result);
    assert.match(result.stderr, /Ambiguous: "OG"\. Did you mean:/);
    assert.match(result.stderr, /OG Kush \[flower\]/);
    assert.match(result.stderr, /OG King \[flower\]/);
  });
});

describe('price command', () => {
  it('sets per-gram price', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['price', 'OG', 'Kush', '11']);
    assertOk(result);
    assert.match(result.stdout, /OG Kush: \$11\.00\/g/);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.find(entry => entry.name === 'OG Kush').prices.perGram, 11);
  });

  it('sets bag price', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['price', 'OG', 'Kush', 'bag', '3.5', '28']);
    assertOk(result);
    assert.match(result.stdout, /OG Kush: 3\.5g bag = \$28\.00/);
    const data = readJson(dir, 'data.json');
    assert.equal(data.inventory.find(entry => entry.name === 'OG Kush').prices.bags['3.5'], 28);
  });
});

describe('order and orders commands', () => {
  it('places order and writes to orders.json', async () => {
    const data = clone(defaultData);
    data.inventory[0] = {
      ...data.inventory[0],
      name: 'OG Kush',
      category: 'flower',
      unit: 'g',
      prices: { perGram: 10 }
    };
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['order', 'OG', 'Kush', '2']);
    assertOk(result);
    assert.match(result.stdout, /Order placed: 2g of OG Kush/);
    assert.match(result.stdout, /Price: \$20\.00/);
    assert.match(result.stdout, /Status: pending/);
    const orders = readJson(dir, 'orders.json');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].name, 'OG Kush');
    assert.equal(orders[0].quantity, 2);
    assert.equal(orders[0].price, 20);
  });

  it('shows local orders with optional limit', async () => {
    const orders = [
      { id: 1, name: 'OG Kush', quantity: 1, unit: 'g', price: 10, status: 'pending', placedAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'Bliss Gummies', quantity: 100, unit: 'mg', price: null, status: 'pending', placedAt: '2026-01-02T00:00:00.000Z' },
      { id: 3, name: 'Live Rosin', quantity: 2, unit: 'g', price: 40, status: 'pending', placedAt: '2026-01-03T00:00:00.000Z' }
    ];
    const dir = createSandbox({ orders });
    const result = await runCli(dir, ['orders', '2']);
    assertOk(result);
    assert.match(result.stdout, /Orders \(2\/3\):/);
    assert.doesNotMatch(result.stdout, /OG Kush/);
    assert.match(result.stdout, /Bliss Gummies/);
    assert.match(result.stdout, /Live Rosin/);
  });
});

describe('stats command', () => {
  it('shows overall stats', async () => {
    const data = clone(defaultData);
    data.history = [
      { action: 'add', name: 'OG Kush', quantity: 7, unit: 'g', timestamp: '2026-01-01T00:00:00.000Z' },
      { action: 'add', name: 'Bliss Gummies', quantity: 500, unit: 'mg', timestamp: '2026-01-02T00:00:00.000Z' },
      { action: 'use', name: 'OG Kush', quantity: 0.5, unit: 'g', timestamp: '2026-01-03T00:00:00.000Z' }
    ];
    const orders = [
      { id: 1, name: 'OG Kush', quantity: 2, unit: 'g', price: 20, status: 'pending', placedAt: '2026-01-04T00:00:00.000Z' }
    ];
    const dir = createSandbox({ data, orders });
    const result = await runCli(dir, ['stats']);
    assertOk(result);
    assert.match(result.stdout, /^Stats:/m);
    assert.match(result.stdout, /Items tracked: 2/);
    assert.match(result.stdout, /Total inventory: 507/);
    assert.match(result.stdout, /Total added \(all time\): 507/);
    assert.match(result.stdout, /Total consumed: 0\.5 \(1 sessions\)/);
    assert.match(result.stdout, /Orders placed: 1 · Total spent: \$20\.00/);
    assert.match(result.stdout, /Per-category breakdown:/);
    assert.match(result.stdout, /edibles: 1 items \(500mg\)/);
    assert.match(result.stdout, /flower: 1 items \(7g\)/);
  });

  it('shows per-category stats', async () => {
    const data = clone(defaultData);
    data.history = [
      { action: 'add', name: 'OG Kush', quantity: 7, unit: 'g', timestamp: '2026-01-01T00:00:00.000Z' },
      { action: 'use', name: 'OG Kush', quantity: 1, unit: 'g', timestamp: '2026-01-02T00:00:00.000Z' }
    ];
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['stats', 'flower']);
    assertOk(result);
    assert.match(result.stdout, /Stats for flower:/);
    assert.match(result.stdout, /Items tracked: 1/);
    assert.match(result.stdout, /Total consumed: 1 \(1 sessions\)/);
    assert.doesNotMatch(result.stdout, /Per-category breakdown:/);
  });
});

describe('log command', () => {
  it('shows history', async () => {
    const data = clone(defaultData);
    data.history = [
      { action: 'add', name: 'OG Kush', quantity: 7, unit: 'g', timestamp: '2026-01-01T00:00:00.000Z' },
      { action: 'use', name: 'OG Kush', quantity: 0.5, unit: 'g', timestamp: '2026-01-02T00:00:00.000Z' }
    ];
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['log']);
    assertOk(result);
    assert.match(result.stdout, /History \(2\/2\):/);
    assert.match(result.stdout, /add 7g of OG Kush/);
    assert.match(result.stdout, /use 0\.5g of OG Kush/);
  });

  it('limits history entries', async () => {
    const data = clone(defaultData);
    data.history = [
      { action: 'add', name: 'OG Kush', quantity: 7, unit: 'g', timestamp: '2026-01-01T00:00:00.000Z' },
      { action: 'use', name: 'OG Kush', quantity: 0.5, unit: 'g', timestamp: '2026-01-02T00:00:00.000Z' },
      { action: 'add', name: 'Bliss Gummies', quantity: 500, unit: 'mg', timestamp: '2026-01-03T00:00:00.000Z' }
    ];
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['log', '2']);
    assertOk(result);
    assert.match(result.stdout, /History \(2\/3\):/);
    assert.doesNotMatch(result.stdout, /add 7g of OG Kush/);
    assert.match(result.stdout, /use 0\.5g of OG Kush/);
    assert.match(result.stdout, /add 500mg of Bliss Gummies/);
  });
});

describe('config command', () => {
  it('shows current config', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['config']);
    assertOk(result);
    assert.match(result.stdout, /Current config: session size = 0\.5g/);
    assert.match(result.stdout, /Current root URL: https:\/\/greenlandbotanicals\.cc/);
  });

  it('sets session size', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['config', 'session', '0.8']);
    assertOk(result);
    assert.match(result.stdout, /Default session size set to 0\.8g\./);
    const config = readJson(dir, 'config.json');
    assert.equal(config.sessionSize, 0.8);
  });

  it('sets root URL', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['config', 'url', 'https://example.com/shop']);
    assertOk(result);
    assert.match(result.stdout, /Root URL set to https:\/\/example\.com\/shop/);
    const config = readJson(dir, 'config.json');
    assert.equal(config.rootUrl, 'https://example.com/shop');
  });
});

describe('migration', () => {
  it('normalizes old strain-only items on load', async () => {
    const data = {
      inventory: [
        { strain: 'Purple Punch', quantity: 3, dateAdded: '2026-01-01T00:00:00.000Z' }
      ],
      history: []
    };
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['list']);
    assertOk(result);
    assert.match(result.stdout, /Purple Punch: 3 g/);
    assert.match(result.stdout, /=== FLOWER ===/);
    // After a write operation, the normalized data should be persisted
    await runCli(dir, ['add', 'Purple', 'Punch', '1']);
    const saved = readJson(dir, 'data.json');
    const item = saved.inventory.find(e => e.name === 'Purple Punch');
    assert.ok(item, 'Purple Punch should exist in saved data');
    assert.equal(item.strain, undefined, 'strain field should not exist after migration');
  });
});

describe('add --url flag', () => {
  it('persists url in data.json', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'Budget', 'Oz', '28', '--url', 'https://greenlandbotanicals.cc/product/budget-oz/']);
    assertOk(result);
    const data = readJson(dir, 'data.json');
    const item = data.inventory.find(e => e.name === 'Budget Oz');
    assert.equal(item.url, 'https://greenlandbotanicals.cc/product/budget-oz/');
    assert.equal(item.quantity, 28);
  });

  it('updates url on existing item', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['add', 'OG', 'Kush', '1', '--url', 'https://greenlandbotanicals.cc/product/og-kush/']);
    assertOk(result);
    const data = readJson(dir, 'data.json');
    const item = data.inventory.find(e => e.name === 'OG Kush');
    assert.equal(item.url, 'https://greenlandbotanicals.cc/product/og-kush/');
  });
});

describe('order --local flag', () => {
  it('places local-only order with --local', async () => {
    const data = clone(defaultData);
    data.inventory[0].url = 'https://greenlandbotanicals.cc/product/og-kush/';
    const dir = createSandbox({ data });
    const result = await runCli(dir, ['order', 'OG', 'Kush', '2', '--local']);
    assertOk(result);
    assert.match(result.stdout, /Order placed: 2g of OG Kush/);
    assert.match(result.stdout, /Status: pending/);
    const orders = readJson(dir, 'orders.json');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, 'pending');
  });

  it('falls back to local when no url set', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['order', 'OG', 'Kush', '1']);
    assertOk(result);
    assert.match(result.stdout, /Order placed: 1g of OG Kush/);
    assert.match(result.stdout, /local-only: no product URL set/);
  });
});

describe('confirm command', () => {
  it('errors with no arguments', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['confirm']);
    assertFail(result);
    assert.match(result.stderr, /Usage: weed confirm/);
  });

  it('errors when order id not found', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['confirm', '99999']);
    assertFail(result);
    assert.match(result.stderr, /No confirmation URL found/);
  });

  it('looks up confirmation URL from local order', async () => {
    const orders = [{
      id: 12345,
      name: 'Budget Oz',
      quantity: 1,
      unit: 'g',
      price: 60,
      status: 'confirmed',
      remoteOrderId: '6869',
      confirmationUrl: 'https://greenlandbotanicals.cc/checkout/order-received/84429/',
      placedAt: '2026-03-13T00:00:00.000Z'
    }];
    const dir = createSandbox({ orders });
    // This will fail because Puppeteer can't reach the URL in test, but it proves the lookup works
    const result = await runCli(dir, ['confirm', '6869']);
    // Should attempt to scrape (not "No confirmation URL found")
    assert.doesNotMatch(result.stderr, /No confirmation URL found/);
  });
});

describe('no strain field in output', () => {
  it('find output has no strain field', async () => {
    const dir = createSandbox();
    const result = await runCli(dir, ['find', 'OG']);
    assertOk(result);
    assert.doesNotMatch(result.stdout, /strain/i);
  });

  it('saved data has no strain field after add', async () => {
    const dir = createSandbox();
    await runCli(dir, ['add', 'New', 'Strain', '5']);
    const data = readJson(dir, 'data.json');
    const item = data.inventory.find(e => e.name === 'New Strain');
    assert.equal(item.strain, undefined);
  });
});
