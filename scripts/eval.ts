import { funnelQuality, leakTest, planCorrectness } from "../lib/eval";

(async () => {
  const leak = await leakTest();
  console.log(`\n== Leak test (${leak.mode}) ==`);
  console.table(leak.rows.map((r) => ({ config: r.label, replies: r.messages, leaks: r.leaks, blocked: r.blocked, rewritten: r.rewritten })));
  console.log(leak.note);
  console.log("\n== Plan correctness ==");
  console.log(await planCorrectness());
  console.log("\n== Funnel quality ==");
  console.log(await funnelQuality());
})();
