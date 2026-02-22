#!/usr/bin/env node
const { getBriefing } = require('../src/briefing');
const { DOMParser } = require('@xmldom/xmldom');

function escapeXml(text) {
  return text
    // Normalize smart quotes and special chars first
    .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes → straight
    .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes → straight
    .replace(/[\u2013\u2014]/g, '-')  // En/em dashes → hyphen
    .replace(/\u2026/g, '...')        // Ellipsis → three dots
    // Then escape XML special characters
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function briefingToSsml(text) {
  const sections = text.split(/\n\n+/);
  let ssml = '';
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    if (ssml) ssml += '<break time="800ms"/>';
    const escaped = escapeXml(trimmed);
    const withHeaders = escaped.replace(
      /^(Weather|Your calendar|Reminders|Markets|News headlines|That&apos;s your briefing)\./m,
      '<emphasis level="moderate">$1.</emphasis><break time="400ms"/>'
    );
    ssml += withHeaders;
  }
  return ssml;
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

(async () => {
  try {
    console.log('Generating briefing...');
    const briefing = await getBriefing();

    console.log('\nConverting to SSML...');
    const ssml = briefingToSsml(briefing);

    console.log('Chunking...');
    const chunks = chunkText(ssml, 3500);

    const voice = 'Polly.Joanna-Neural';
    const sayElements = chunks
      .map(chunk => `<Say voice="${voice}">${chunk}</Say><Pause length="1"/>`)
      .join('\n');
    const twiml = `<Response>\n${sayElements}\n</Response>`;

    console.log('\n=== XML VALIDATION ===');
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg) => console.warn('⚠️  Warning:', msg),
        error: (msg) => { throw new Error('XML Error: ' + msg); },
        fatalError: (msg) => { throw new Error('Fatal XML Error: ' + msg); }
      }
    });

    const doc = parser.parseFromString(twiml, 'text/xml');
    console.log('✅ Valid XML');

    console.log('\n=== STATS ===');
    console.log('Length:', twiml.length, 'chars');
    console.log('Chunks:', chunks.length);
    console.log('Max chunk:', Math.max(...chunks.map(c => c.length)), 'chars');

    console.log('\n=== PREVIEW (first 500 chars) ===');
    console.log(twiml.substring(0, 500) + '...');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ VALIDATION FAILED');
    console.error(err.message);
    process.exit(1);
  }
})();
