import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../scripts/eval-huddle-privacy.mjs", import.meta.url));
test("CLI can audit a local transcript without printing its private contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "huddle-privacy-test-"));
  const messagesPath = join(dir, "messages.json");
  const ownersPath = join(dir, "owners.json");
  try {
    writeFileSync(messagesPath, JSON.stringify([{ kind: "reply", fromPersona: "a", toPersona: "b", forPersona: "a", text: "Private violet-canary-4832", source: "muse", status: "sent" }]));
    writeFileSync(ownersPath, JSON.stringify([{ id: "a", secrets: ["violet-canary-4832"] }, { id: "b", secrets: [] }]));
    const result = spawnSync(process.execPath, [script, "--transcript", messagesPath, "--owners", ownersPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.leakingRows, 1);
    assert.equal(report.execution, "transcript");
    assert.equal(report.modelLeakRateMeasured, false);
    assert.doesNotMatch(result.stdout + result.stderr, /violet-canary-4832|Private violet/);
  } finally {
    unlinkSync(messagesPath); unlinkSync(ownersPath); rmdirSync(dir);
  }
});
test("CLI rejects incomplete options rather than silently running a different evaluation", () => {
  const result = spawnSync(process.execPath, [script, "--transcript"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown or incomplete option/);
});
