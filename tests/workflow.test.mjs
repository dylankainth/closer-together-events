// Structural checks for .github/workflows/ci.yml, the pipeline that deploys Convex.
// They guard the failure modes that hurt during the hackathon: deploying without tests,
// overlapping deploys, the admin key leaking into logs, and a deploy that silently skips.
// They do not prove a deploy works; only a real push to the trunk branch does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { load } from "js-yaml";

const TRUNK = "main"; // keep in sync with on.push.branches and the deploy job's `if`
const SECRET = "secrets.CONVEX_SELF_HOSTED_ADMIN_KEY";
const PATH = new URL("../.github/workflows/ci.yml", import.meta.url);

const raw = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";
const wf = raw ? load(raw) : {};
const jobs = wf.jobs ?? {};
const steps = (job) => jobs[job]?.steps ?? [];
const runOf = (step) => (typeof step.run === "string" ? step.run : "");
const allSteps = () => Object.entries(jobs).flatMap(([name, job]) => (job.steps ?? []).map((s) => [name, s]));

test("workflow file exists", () => {
  assert.ok(raw, ".github/workflows/ci.yml is missing");
});

test("runs on every pull request and deploys only from the trunk branch", () => {
  assert.ok("pull_request" in (wf.on ?? {}), "pull_request trigger missing");
  assert.deepEqual(wf.on?.push?.branches, [TRUNK]);
  // Exact match: a substring check would accept `... || true` or `... || github.event_name == 'pull_request'`.
  assert.equal(
    jobs.deploy?.if,
    `(github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/${TRUNK}'`,
  );
});

test("token is read-only", () => {
  assert.deepEqual(wf.permissions, { contents: "read" });
});

test("test job is the required check and never sees the admin key", () => {
  assert.equal(jobs.test?.name, "test");
  assert.ok(steps("test").some((s) => /\bnpm test\b/.test(runOf(s))), "test job must run npm test");
  assert.ok(!JSON.stringify(jobs.test).includes("secrets."), "test job must not reference secrets");
});

test("deploy waits for tests and never overlaps another deploy", () => {
  const needs = [].concat(jobs.deploy?.needs ?? []);
  assert.ok(needs.includes("test"), "deploy must need test");
  assert.ok(jobs.deploy?.concurrency?.group, "deploy needs its own concurrency group");
  assert.equal(jobs.deploy?.concurrency?.["cancel-in-progress"], false);
  // The workflow-level group may cancel superseded PR runs, never a run on the trunk branch.
  assert.equal(wf.concurrency?.["cancel-in-progress"], "${{ github.event_name == 'pull_request' }}");
});

test("typecheck stays advisory and never gates the deploy", () => {
  assert.equal(jobs.typecheck?.["continue-on-error"], true);
  assert.ok(![].concat(jobs.deploy?.needs ?? []).includes("typecheck"), "deploy must not need typecheck yet");
});

test("deploy fails loudly when the secret is missing, before deploying", () => {
  const ds = steps("deploy");
  const guard = ds.findIndex((s) => /exit 1/.test(runOf(s)) && /::error::/.test(runOf(s)));
  const deploy = ds.findIndex((s) => /npx convex deploy\b/.test(runOf(s)));
  assert.ok(guard >= 0, "guard step (::error:: + exit 1) missing");
  assert.ok(deploy >= 0, "npx convex deploy step missing");
  assert.ok(guard < deploy, "guard must run before the deploy");
  const smoke = ds.findIndex((s, i) => i > deploy && /\/version/.test(runOf(s)));
  assert.ok(smoke > deploy, "a smoke check must follow the deploy");
});

test("admin key only ever reaches step env blocks, and is never printed", () => {
  for (const [job, s] of allSteps()) {
    assert.ok(!runOf(s).includes("secrets."), `${job}: secret interpolated into a run script`);
    assert.doesNotMatch(runOf(s), /set -x|printenv|^\s*env\s*$/m, `${job}: may print env`);
    assert.doesNotMatch(runOf(s), /(echo|printf)[^\n]*\$\{?CONVEX_SELF_HOSTED_ADMIN_KEY/, `${job}: prints the key value`);
  }
  const holders = allSteps().filter(([, s]) => JSON.stringify(s.env ?? {}).includes(SECRET)).map(([j]) => j);
  assert.ok(holders.includes("deploy"), "deploy step env must carry the secret");
  assert.ok(holders.every((j) => j === "deploy" || j === "typecheck"), `secret in unexpected job: ${holders}`);
  const outsideStepEnv = raw.split(SECRET).length - 1;
  assert.equal(outsideStepEnv, allSteps().reduce((n, [, s]) => n + (JSON.stringify(s.env ?? {}).split(SECRET).length - 1), 0),
    "secret referenced outside step env blocks");
});

test("CI never edits deployment env vars or mixes deployment modes", () => {
  assert.doesNotMatch(raw, /convex\s+env\b/);
  assert.doesNotMatch(raw, /CONVEX_DEPLOYMENT\b/);
  assert.equal(wf.env?.CONVEX_SELF_HOSTED_URL, "https://convex-api.keanuc.net");
});

test("actions are pinned and installs are reproducible", () => {
  for (const [job, s] of allSteps()) {
    if (s.uses) assert.match(s.uses, /@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/, `${job}: unpinned ${s.uses}`);
    assert.doesNotMatch(runOf(s), /npm install\b|npm i\b/, `${job}: use npm ci`);
    if (String(s.uses ?? "").startsWith("actions/setup-node@")) {
      assert.equal(s.with?.["node-version-file"], ".nvmrc", `${job}: node version must come from .nvmrc`);
    }
  }
  assert.ok(existsSync(new URL("../.nvmrc", import.meta.url)), ".nvmrc missing");
});
