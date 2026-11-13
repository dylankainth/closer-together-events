// claude.md §3.1: the one vendor action that leaves the app for real is a food order, sent only on
// the host's explicit approval. It used to be cake-only, so a watch/game night (which drafts a
// pizza, not a cake) silently never produced a real email. This generalises it to any orderable
// food draft while keeping the approval gate and the env-only recipient.
//
// Source-shape assertions, like announceGate: emailAction/agentTools/plan carry "use node" and the
// Muse graph, so they don't import under the plain Node loader. These pin the properties a future
// edit could silently undo — which is exactly how the cake step broke once already.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(new URL(`../convex/${f}`, import.meta.url), "utf8");

test("plan.ts names the orderable food drafts in one shared place, and pizza is one of them", () => {
  const plan = src("plan.ts");
  assert.ok(/export const ORDERABLE_VENDOR_IDS/.test(plan), "a single source of truth for which draft is real");
  const list = plan.slice(plan.indexOf("ORDERABLE_VENDOR_IDS"));
  for (const id of ["cake", "pizza", "snacks"]) {
    assert.ok(new RegExp(`"${id}"`).test(list.slice(0, 120)), `${id} must be an orderable vendor id`);
  }
});

test("a watch/game night (not birthday, not housewarming) drafts a real pizza order", () => {
  const plan = src("plan.ts");
  const start = plan.indexOf("export function vendorDrafts");
  const body = plan.slice(start, plan.indexOf("const PALETTES", start));
  assert.ok(/add\("pizza"/.test(body), "vendorDrafts must add a pizza draft");
  const elseIdx = body.lastIndexOf("} else {");
  assert.ok(elseIdx !== -1 && /add\("pizza"/.test(body.slice(elseIdx)), "pizza is the catch-all (watch/game night) branch");
});

test("agentTools queues the real email task for any orderable draft, not just cake", () => {
  const tools = src("agentTools.ts");
  const fn = tools.slice(tools.indexOf("draft_vendor_orders: Tool"));
  assert.ok(/ORDERABLE_VENDOR_IDS/.test(fn), "selection must use the shared orderable list");
  assert.equal(/d\.id === "cake"/.test(fn), false, "must not hard-code cake as the only real order");
  const block = fn.slice(fn.indexOf("if (order)"));
  assert.ok(/kind: "order_cake"/.test(block), "the real order still queues under the approval-gated task kind");
  assert.ok(/internal\.events\.addTask/.test(block), "it goes through addTask, which dedups and the host approves");
});

test("emailAction composes for whatever was ordered and never hard-codes cake only", () => {
  const email = src("emailAction.ts");
  assert.ok(/ORDERABLE_VENDOR_IDS/.test(email), "the matcher uses the shared orderable list");
  assert.ok(/function orderableDraft/.test(email), "one helper picks the orderable draft");
  assert.ok(/\$\{item\} order email to \$\{vendor\}/.test(email), "the prompt is built from the actual item + vendor");
  assert.equal(/cake-order email to a bakery/.test(email), false, "the cake-specific prompt must be gone");
});

test("the recipient is env-only and never a hard-coded address", () => {
  const email = src("emailAction.ts");
  assert.ok(/process\.env\.VENDOR_ORDER_TO/.test(email), "new recipient env var");
  assert.ok(/process\.env\.CAKE_ORDER_TO/.test(email), "still reads the already-configured demo recipient");
  assert.equal(/@(gmail|outlook|yahoo|proton)/i.test(email), false, "no personal address in source");
});
