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
