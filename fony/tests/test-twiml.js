#!/usr/bin/env node
const { getBriefing } = require('./src/briefing');

function escapeXml(text) {
  return text
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
  const briefing = await getBriefing();
  const ssml = briefingToSsml(briefing);
  const chunks = chunkText(ssml, 3500);
  const voice = 'Polly.Joanna-Neural';
  const sayElements = chunks
    .map(chunk => `<Say voice="${voice}">${chunk}</Say><Pause length="1"/>`)
    .join('\n');
  const twiml = `<Response>\n${sayElements}\n</Response>`;

  console.log('=== FULL TWIML ===');
  console.log(twiml);
  console.log('\n=== VALIDATION ===');
  console.log('Length:', twiml.length, 'chars');
  console.log('Chunks:', chunks.length);
  console.log('Max chunk length:', Math.max(...chunks.map(c => c.length)));
})();
