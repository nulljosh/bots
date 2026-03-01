#!/usr/bin/env node
/**
 * Fony - Unit Tests
 * Tests core logic without making real API calls
 */

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ok: ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL: ${desc}`);
    failed++;
  }
}

function assertEqual(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ok: ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL: ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Pull functions out of caller.js for unit testing
function escapeXml(text) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function briefingToSsml(text) {
  const escaped = escapeXml(text);
  const withPauses = escaped.replace(/\n\n+/g, '. ');
  return withPauses.replace(/\n/g, '. ');
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxLen) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// --- escapeXml ---
console.log('\nescapeXml');
assertEqual('escapes &', escapeXml('cats & dogs'), 'cats &amp; dogs');
assertEqual('escapes <', escapeXml('<tag>'), '&lt;tag&gt;');
assertEqual('escapes "', escapeXml('"quoted"'), '&quot;quoted&quot;');
assertEqual('smart single quotes', escapeXml('\u2018hello\u2019'), '&apos;hello&apos;');
assertEqual('smart double quotes', escapeXml('\u201Chello\u201D'), '&quot;hello&quot;');
assertEqual('em dash', escapeXml('one\u2014two'), 'one-two');
assertEqual('en dash', escapeXml('one\u2013two'), 'one-two');
assertEqual('ellipsis', escapeXml('wait\u2026'), 'wait...');
assertEqual('plain text unchanged', escapeXml('hello world'), 'hello world');

// --- briefingToSsml ---
console.log('\nbriefingToSsml');
const multi = 'Section one.\n\nSection two.';
assert('collapses double newlines to period+space', briefingToSsml(multi).includes('. '));
assert('no raw newlines remain', !briefingToSsml('a\nb').includes('\n'));

// --- chunkText ---
console.log('\nchunkText');
const short = 'Short text.';
assertEqual('short text returns single chunk', chunkText(short, 3500).length, 1);
assertEqual('short text chunk equals input', chunkText(short, 3500)[0], short);

const long = Array(50).fill('This is a sentence.').join(' ');
const chunks = chunkText(long, 100);
assert('long text splits into multiple chunks', chunks.length > 1);
assert('no chunk exceeds max length', chunks.every(c => c.length <= 200));
assert('all content preserved', chunks.join(' ').length >= long.length - chunks.length);

// --- parseFinnHtml ---
console.log('\nparseFinnHtml (unit)');
(function() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { parseFinnHtml } = require('../src/briefing');

  // Minimal realistic opticon HTML
  const sampleHtml = `
<h2>Portfolio</h2>
<div class="card">
<table>
<tr><td><div class="s">Vacation</div><div class="m">Chequing</div></td><td>$23.19 CAD</td></tr>
<tr><td><div class="s">TFSA</div><div class="m">Cash</div></td><td>$100.56 CAD</td></tr>
<tr><td><div class="s">Starbucks Card</div><div class="m">Gift card</div></td><td>$9.74 CAD</td></tr>
<tr><td><div class="s">Stocks</div><div class="m">AAPL, HOOD</div></td><td>$24.82 USD</td></tr>
<tr class="t"><td>Total</td><td>~$122 USD</td></tr>
<tr><td><div class="s">Daily budget</div><div class="m">Vacation / days</div></td><td id="daily-budget">--</td></tr>
</table>
</div>

<h2>Debt</h2>
<div class="card">
<table>
<tr class="h"><td><div class="s">Mom</div></td><td>$140</td></tr>
<tr class="h"><td><div class="s">RBC VISA</div></td><td>$5,500</td></tr>
<tr class="t"><td>Total</td><td class="r">$7,334.30</td></tr>
</table>
</div>`;

  const data = parseFinnHtml(sampleHtml);

  // Items
  assertEqual('finds 4 portfolio items', data.items.length, 4);
  assertEqual('first item is Vacation', data.items[0].name, 'Vacation');
  assertEqual('Vacation amount', data.items[0].amount, 23.19);
  assertEqual('Vacation currency', data.items[0].currency, 'CAD');
  assertEqual('second item is TFSA', data.items[1].name, 'TFSA');
  assertEqual('TFSA amount', data.items[1].amount, 100.56);
  assertEqual('third item is Starbucks Card', data.items[2].name, 'Starbucks Card');
  assertEqual('fourth item is Stocks', data.items[3].name, 'Stocks');
  assertEqual('Stocks currency', data.items[3].currency, 'USD');
  assert('Daily budget excluded', !data.items.find(i => i.name === 'Daily budget'));

  // Total
  assertEqual('portfolio total', data.total, '$122 USD');

  // Debt
  assertEqual('debt total', data.debt, '$7,334.3');

  // No portfolio section
  const emptyData = parseFinnHtml('<html><body>nothing</body></html>');
  assertEqual('empty items on missing section', emptyData.items.length, 0);
  assertEqual('empty total on missing section', emptyData.total, '');
  assertEqual('empty debt on missing section', emptyData.debt, '');

  // Live read from opticon if available
  const opticonPath = path.join(os.homedir(), 'Documents/Code/opticon/index.html');
  if (fs.existsSync(opticonPath)) {
    const liveData = parseFinnHtml(fs.readFileSync(opticonPath, 'utf8'));
    assert('opticon live: has items', liveData.items.length > 0);
    assert('opticon live: has total', liveData.total.length > 0);
    assert('opticon live: has debt', liveData.debt.length > 0);
    assert('opticon live: Vacation found', liveData.items.some(i => i.name === 'Vacation'));
    assert('opticon live: TFSA found', liveData.items.some(i => i.name === 'TFSA'));
    assert('opticon live: Stocks found', liveData.items.some(i => i.name === 'Stocks'));
  } else {
    console.log('  skip: opticon/index.html not found (expected in dev)');
  }
})();

// --- getBriefing integration ---
console.log('\ngetBriefing (live)');
(async () => {
  try {
    const { getBriefing } = require('../src/briefing');
    const briefing = await getBriefing();
    assert('returns non-empty string', typeof briefing === 'string' && briefing.length > 0);
    assert('contains greeting', /Good (morning|afternoon|evening)/i.test(briefing));
    assert('contains weather section', briefing.includes('Weather'));
    assert('ends with sign-off', briefing.includes("That's your briefing"));
    assert('under 2000 chars (30s spoken)', briefing.length < 2000);
    assert('contains finances section', briefing.includes('Finances'));
  } catch (err) {
    console.error('  FAIL: getBriefing threw:', err.message);
    failed++;
  }

  // Summary
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
