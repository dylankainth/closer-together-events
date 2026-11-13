# Recovering interrupted Muse conversations

The host sees progress and **Retry conversations** on the swarm and Manage overview. Retry is
available after a recorded failure, or two minutes without a committed message/recommendation.
Running conversations with a valid lease and completed conversations cannot be restarted.

Each initial guest group and later plus-one invitation has an independent `huddleRuns` row.
Retry increments that row's attempt, clears only its stale recommendations, and schedules the
same recipients with privacy checks enabled. It never resends invitations, changes anyone's
RSVP, or restarts another cohort. The event's existing Muse call budget is not reset.

Messages and recommendations check the current attempt in their write transaction. A late
model response from an older attempt cannot commit after a retry. A run can finalize only its
own current attempt. Transcript history remains stored; current transcript/reason queries omit
superseded attempts.

Older events without run records can recover eligible recipients whose recommendations are
missing after two minutes without message progress. Once a tracked run exists, untracked old
actions cannot write over it. The quiet period is a compatibility heuristic; all newly scheduled
conversations have explicit run records.

The recovery endpoints use the same host guard and `AUTHZ_MODE` behavior as Approve/Send:
ownership is enforced normally, and the stage's warning mode continues to permit the unsigned
demo flow. Local validation covers the real action's success/failure path, leases, stale writes,
authorization, Send idempotency, legacy events and cohort isolation. UI timer/duplicate-tap/error
behavior was exercised with mocked React Native components, not a connected physical phone.
