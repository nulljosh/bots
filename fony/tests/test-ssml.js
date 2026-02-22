const { getBriefing } = require('./src/briefing');
const { briefingToSsml } = require('./src/caller');

async function test() {
  const briefing = await getBriefing();
  console.log('=== BRIEFING TEXT ===');
  console.log(briefing.substring(0, 300));

  const ssml = briefingToSsml(briefing);
  console.log('\n=== SSML OUTPUT (first 500 chars) ===');
  console.log(ssml.substring(0, 500));

  console.log('\n=== VALIDATION ===');
  if (ssml.includes('Currently')) console.log('✅ "Currently" present');
  else console.log('❌ "Currently" MISSING or corrupted');

  if (briefing.includes('Congress') && ssml.includes('Congress')) console.log('✅ "Congress" present');
  else if (briefing.includes('Congress')) console.log('❌ "Congress" MISSING or corrupted');
}

test().catch(console.error);
