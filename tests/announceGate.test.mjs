// claude.md §3.1: "The host approves before anything is sent or committed."
//
// tellGuests used to announce straight from the Muse's PARAPHRASE of what the host said — one
// ambiguous line in chat and a blast went to every guest in the event. Keanu caught it in review.
// The fix routes it through the same gate vendor orders already use.
//
// These are source-shape assertions rather than behavioural ones because the gate is spread across
// three Convex-coupled modules (hostChat proposes, taskRunner blocks, events.approveTask sends) and
// none of them import under the plain Node loader. Weak as tests go, but they pin the one property
// that actually matters and that a future edit could silently undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(new URL(`../convex/${f}`, import.meta.url), "utf8");

test("hostChat proposes an announcement, it never sends one", () => {
  const hostChat = src("hostChat.ts");
  assert.ok(hostChat.includes("r.data.tellGuests?.text"), "the tellGuests tool should still exist");
  assert.equal(
    /addAnnouncement/.test(hostChat),
    false,
    "hostChat must not call addAnnouncement directly — it has to go through approveTask",
  );
  assert.ok(/kind: "announce"/.test(hostChat), "it should add an 'announce' task instead");
});

test("taskRunner always parks an announce task for the host", () => {
  const runner = src("taskRunner.ts");
  const branch = runner.slice(runner.indexOf('task.kind === "announce"'));
  assert.ok(branch.length > 0, "taskRunner needs an 'announce' branch");
  const body = branch.slice(0, branch.indexOf("return;"));
  assert.ok(/status: "blocked"/.test(body), "an announce task must land blocked, never run through");
  assert.ok(/needsYou/.test(body), "the host has to be shown the exact text");
});

test("only approveTask announces, and only once", () => {
  const events = src("events.ts");
  const branch = events.slice(events.indexOf('if (task.kind === "announce")'));
  const body = branch.slice(0, branch.indexOf("\n    }"));
  assert.ok(/internal\.events\.addAnnouncement/.test(body), "approval is what actually announces");
  assert.ok(
    /task\.status !== "blocked"/.test(body),
    "a double tap must not send the same announcement twice",
  );
});

test("the 'announce' kind is accepted everywhere a task kind is validated", () => {
  for (const f of ["schema.ts", "events.ts"]) {
    assert.ok(src(f).includes('v.literal("announce")'), `${f} rejects announce tasks`);
  }
  assert.ok(src("types.ts").includes('"announce"'), "types.ts is out of step with the schema");
});
