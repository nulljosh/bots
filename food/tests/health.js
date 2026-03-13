// health.js - test all food bot integrations
import { DominosStoreFinder, McDonaldsAPI, ChipotleAPI, TacoBellAPI, PizzaHutAPI, FirehouseSubsAPI, DairyQueenAPI } from "./food.js";

const tests = [
  { name: "Dominos", fn: async () => { const f = new DominosStoreFinder("https://order.dominos.ca", "en"); return await f.find({ type: "Delivery", c: "20690 40 Ave, Langley, BC" }); } },
  { name: "McDonalds", fn: async () => { const m = new McDonaldsAPI(); return await m.getMenu(); } },
  { name: "Chipotle", fn: async () => { const c = new ChipotleAPI(); return await c.searchStores(47.6, -122.3); } },
  { name: "TacoBell", fn: async () => { const t = new TacoBellAPI(); return await t.getMenu(); } },
  { name: "PizzaHut", fn: async () => { const p = new PizzaHutAPI(); return await p.getMenu(); } },
  { name: "Firehouse (static)", fn: async () => { const f = new FirehouseSubsAPI(); return f.getMenu(); } },
  { name: "DairyQueen (static)", fn: async () => { const d = new DairyQueenAPI(); return d.getMenu(); } },
];

for (const test of tests) {
  try {
    const result = await test.fn();
    if (result === undefined || result === null) throw new Error('Empty response');
    console.log(`✅ ${test.name}: OK`);
  } catch (e) {
    console.log(`❌ ${test.name}: FAIL - ${e.message}`);
  }
}
