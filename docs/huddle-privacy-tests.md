# Huddle privacy regression harness

Run from a checkout containing Dylan's free-conversation implementation (`a114182` or newer):

```sh
node --test tests/huddlePrivacy*.test.mjs
node scripts/eval-huddle-privacy.mjs
node scripts/eval-huddle-privacy.mjs --json
```

The harness runs the actual `runHuddle`, `runExchange`, `guardOutgoing`, `guardText`, and
`leaksIn` code. It substitutes synthetic model responses and in-memory Convex queries/mutations.
It does not call Muse, use an API key, deploy anything, or write to the shared database.

The matrix compares structured replies with checks, free conversation with checks, and free
conversation without outgoing checks. Incoming injection scrubbing stays enabled in the
checks-off arm, matching production. Clean controls must pass and the unguarded canary control
must leak; an empty or schema-blocked run cannot masquerade as a useful privacy result.

Every emitted row is scanned, including asks, intermediate turns and the final recommendation.
Both `text` and the complete structured `reply` are checked against all supplied personas, so
one speaker leaking someone else's planted fact is detected. Blocked rows are counted
separately from delivered leaks; rewritten rows are rechecked. Reports contain row identifiers
and field names, never the message text or canary values.

`source: "muse"` in a fixture emulates the successful-model code path. It does **not** mean a
model was called. The report always says `execution: "fixture"` and
`modelLeakRateMeasured: false`. Do not quote these counts as real model leakage rates.
The checker itself uses the deterministic privacy fallback in these fixtures.

## Auditing an exported transcript

```sh
node scripts/eval-huddle-privacy.mjs --transcript .expo/messages.json --owners .expo/personas.json
```

The first file is an array of huddle message rows. The second is a complete array of participating
personas with `id`, `secrets` (planted canaries, normalized to lowercase), and `neverShare`. Missing participants
or malformed rows fail the audit instead of silently reducing the reported leak count. Keep
exports local and out of git. Prefer the seeded/synthetic personas for comparisons.

Transcript mode checks the supplied rows; it does not establish that their generation or privacy
checks were all live. Source counts are informational, and unknown provenance stays unknown.
The exit code is nonzero if a delivered disclosure is found, or if an audit is incomplete.

## Scope and limitations

- Exact planted facts and the production address/phone detector are covered. Paraphrases or
  sensitive facts outside that detector can still be missed. Zero matches is not proof of privacy.
- Fixtures stress the enforcement code with controlled unsafe output. They do not measure how
  likely a real model is to produce that output or whether the input context caused it.
- The original `a114182` implementation failed three guarded cases. The final-recommendation
  bypasses, including stored reasons, were corrected on main by PR #18 and the free-mode
  integration (`c67c501`). This branch adds tests, a CLI and documentation only.
- **Known limitation retained by the huddle owner:** free intermediate turns only use regex and
  explicit never-share checks; the broad semantic privacy pass runs on the closing turn to stay
  within the event's call budget. The intermediate semantic-disclosure test is a TODO, not a
  passing safety assertion. The CLI reports those disclosures under `knownLimitations`; exit 0
  means no unexpected regressions, not that every guarded fixture is leak-free. Do not use the
  swarm's zero-private-information counter as proof that this limitation is solved.
