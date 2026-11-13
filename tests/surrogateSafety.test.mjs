// A model wrote a reason containing an emoji. clampReason cut it at 340 UTF-16 code units, which
// landed mid-surrogate-pair, and the lone high surrogate made the whole Convex response
// unserialisable — the picks screen died with "Could not parse return value as json: unexpected
// end of hex escape at line 1 column 86872", naming neither the field nor the event.
//
// One emoji took out a whole screen for one viewer. These assert it can't happen again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampReason, MAX_REASON } from "../convex/discoveryCore.ts";

const hasLoneSurrogate = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
};

// Sanity: the detector itself works, otherwise these tests pass for the wrong reason.
test("the lone-surrogate detector actually detects one", () => {
  assert.equal(hasLoneSurrogate("🎉".slice(0, 1)), true);
  assert.equal(hasLoneSurrogate("🎉"), false);
  assert.equal(hasLoneSurrogate("plain text"), false);
});

test("clampReason never emits a lone surrogate, wherever the emoji lands", () => {
  // Walk the emoji across the cut boundary so one of these lands exactly on the split.
  for (let pad = MAX_REASON - 8; pad < MAX_REASON + 8; pad++) {
    const text = `${"a".repeat(Math.max(pad, 0))}🎉${" tail".repeat(40)}`;
    const out = clampReason(text);
    assert.equal(hasLoneSurrogate(out), false, `pad=${pad} produced a lone surrogate`);
    assert.ok(JSON.parse(JSON.stringify(out)) === out, `pad=${pad} did not survive a JSON round trip`);
  }
});

test("clampReason still does its real job", () => {
  assert.equal(clampReason("  Short   reason. "), "Short reason.");
  const long = "This sentence is here to be kept. " + "x".repeat(MAX_REASON);
  const out = clampReason(long);
  assert.ok(out.length <= MAX_REASON + 1, `got ${out.length}`);
  assert.ok(/[.!?]$/.test(out), `should end on punctuation: ${out.slice(-20)}`);
});

test("an all-emoji reason survives clamping", () => {
  const out = clampReason("🎉".repeat(400));
  assert.equal(hasLoneSurrogate(out), false);
  assert.ok(JSON.parse(JSON.stringify(out)) === out);
});

// Keanu's point: sanitising only at save time leaves every row written BEFORE the fix still able
// to kill a whole query. Reads are the chokepoint, so the guarantee lives there too.
test("scrubText removes unpaired surrogates anywhere, not just trailing", async () => {
  const { scrubText } = await import("../convex/discoveryCore.ts");
  const lone = "\ud83c"; // high surrogate with no partner
  const low = "\udf89"; // low surrogate with no partner
  for (const bad of [lone, `a${lone}b`, `${low}start`, `end${low}`, `${lone}${lone}`, `mid${lone}dle`]) {
    const out = scrubText(bad);
    assert.equal(hasLoneSurrogate(out), false, `failed on ${JSON.stringify(bad)}`);
    assert.ok(JSON.parse(JSON.stringify(out)) === out);
  }
});

// Fixing it per-field fixed one of two paths. `toPickView` was scrubbed; `feed.forViewer`'s own
// `reasons` / `vibe` / `chips` were not, and the SAME screen died again on device with the same
// unhelpful "unexpected end of hex escape at column 86872". The lesson is that the guarantee has
// to live at the query boundary, not on whichever fields someone remembered a model had touched.
test("scrubDeep cleans strings at any depth, in objects and arrays alike", async () => {
  const { scrubDeep } = await import("../convex/discoveryCore.ts");
  const bad = "\ud83c";
  const payload = {
    recommended: [{ title: `Bowling${bad}`, chips: [{ text: `why${bad}` }], reasons: [`a${bad}`, "clean"] }],
    feed: [{ vibe: bad, nested: { deep: { deeper: `x${bad}y` } } }],
    needsMuse: false,
  };
  const out = scrubDeep(payload);
  assert.equal(hasLoneSurrogate(JSON.stringify(out)), false);
  assert.deepEqual(out, {
    recommended: [{ title: "Bowling", chips: [{ text: "why" }], reasons: ["a", "clean"] }],
    feed: [{ vibe: "", nested: { deep: { deeper: "xy" } } }],
    needsMuse: false,
  });
});

test("scrubDeep leaves everything that isn't a broken string exactly as it was", async () => {
  const { scrubDeep } = await import("../convex/discoveryCore.ts");
  // Numbers, booleans, null and absent fields are most of a payload; emoji must survive too.
  const payload = { n: 42, big: 1e21, t: true, nil: null, s: "Bowling 🎳", arr: [1, "two", null] };
  assert.deepEqual(scrubDeep(payload), payload);
  // Dates are valid Convex values and must not be flattened into plain objects by the walk.
  const d = new Date(0);
  assert.equal(scrubDeep({ when: d }).when, d);
});

// The crash came back because a NEW query returned model text without the guard. This is the
// cheap check that catches the next one.
test("every query returning model-written text scrubs at its boundary", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["feed.ts", "huddleData.ts", "notifications.ts", "checklist.ts"]) {
    const src = readFileSync(new URL(`../convex/${f}`, import.meta.url), "utf8");
    assert.ok(src.includes("scrubDeep("), `${f} returns model text without scrubDeep at the boundary`);
  }
});

test("scrubText keeps real emoji and ordinary text intact", async () => {
  const { scrubText } = await import("../convex/discoveryCore.ts");
  assert.equal(scrubText("Bowling 🎳 with Sam 🎉"), "Bowling 🎳 with Sam 🎉");
  assert.equal(scrubText("plain"), "plain");
  assert.equal(scrubText(""), "");
});
