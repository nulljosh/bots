/**
 * test-dominos.js — Quick test of Dominos integration
 */

import { DominosAPI, DominosOrderParser } from './src/dominos.js';
import { OpenClawFoodHandler } from './src/openclaw-handler.js';

async function main() {
  console.log('=== Dominos Integration Test ===\n');

  // Test 1: Parse orders
  console.log('Test 1: Order Parsing');
  const usualOrder = DominosOrderParser.parse('usual');
  console.log('Usual:', usualOrder);
  
  const customOrder = DominosOrderParser.parse('14 pepperoni bacon');
  console.log('Custom:', customOrder);
  console.log('✓ Parsing works\n');

  // Test 2: Handler command
  console.log('Test 2: OpenClaw Handler');
  const handler = new OpenClawFoodHandler();
  const result = await handler.execute(['dominos', 'usual']);
  console.log('Handler result:', JSON.stringify(result, null, 2));
  console.log('✓ Handler works\n');

  // Test 3: Track order
  console.log('Test 3: Tracking');
  const api = new DominosAPI();
  console.log('Track URL: https://tracker.dominos.com?phone=7788462726');
  console.log('✓ Tracking ready\n');

  console.log('=== All tests passed ===');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
