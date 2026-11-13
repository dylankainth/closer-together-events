import { PRIVACY_ARMS, runPrivacyFixture } from "./lib/huddle-privacy-fixtures.mjs";
import { readFileSync } from "node:fs";
import { auditHuddleMessages } from "./lib/huddle-privacy-audit.mjs";
import { loadHuddle } from "./lib/load-huddle.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/eval-huddle-privacy.mjs [--json]");
  console.log("   or: node scripts/eval-huddle-privacy.mjs --transcript messages.json --owners personas.json [--json]");
  console.log("Transcript/owner files stay local. Reports never include message text or canary values.");
  process.exit(0);
}
let transcriptPath, ownersPath;
const json = args.includes("--json");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") continue;
  if (args[i] === "--transcript" && args[i + 1] && !args[i + 1].startsWith("--")) transcriptPath = args[++i];
  else if (args[i] === "--owners" && args[i + 1] && !args[i + 1].startsWith("--")) ownersPath = args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
if (transcriptPath || ownersPath) {
  if (!transcriptPath || !ownersPath) throw new Error("Both --transcript and --owners are required.");
  const messages = JSON.parse(readFileSync(transcriptPath, "utf8"));
  const owners = JSON.parse(readFileSync(ownersPath, "utf8"));
  const { privacy } = loadHuddle();
  const report = auditHuddleMessages(messages, owners, privacy.leaksIn, { execution: "transcript" });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.leakingRows ? 1 : 0);
}

if (!json) {
console.log("Huddle privacy: DETERMINISTIC REGRESSION FIXTURES, not live Muse leak rates.");
console.log("Real huddle code; synthetic people/model responses; no network or database writes.");
}
const rows = [];
const knownLimitations = [];
let guardFailures = 0;
for (const scenario of ["clean", "canary", "phone", "semantic", "final-disclosure", "final-skip", "injection"]) {
  for (const arm of PRIVACY_ARMS) {
    const { report } = await runPrivacyFixture({ ...arm, scenario });
    rows.push({ scenario, arm: arm.label, rows: report.rows, delivered: report.delivered, blocked: report.blocked, rewritten: report.rewritten, leaks: report.leakingRows });
    if (arm.codeCheck && report.leakingRows > 0) {
      if (arm.mode === "free" && scenario === "semantic") {
        knownLimitations.push({ scenario, arm: arm.label, leakingRows: report.leakingRows, reason: "Semantic checking is closing-turn-only by explicit budget policy." });
      } else guardFailures++;
    }
  }
}
if (json) console.log(JSON.stringify({ execution: "fixture", modelLeakRateMeasured: false, guardedFailures: guardFailures, knownLimitations, rows }, null, 2));
else {
  console.table(rows);
  console.log("Incoming injection scrubbing stays enabled in the checks-off baseline.");
  console.log("Exact planted facts and address/phone patterns are checked; semantic/paraphrase coverage is limited.");
  for (const limitation of knownLimitations) console.warn(`KNOWN LIMITATION: ${limitation.reason} ${limitation.leakingRows} intermediate fixture rows disclosed planted private text.`);
}
if (guardFailures) {
  if (!json) console.error(`${guardFailures} guarded scenario(s) delivered private fixture text. Fix before claiming zero leaks.`);
  process.exitCode = 1;
}
