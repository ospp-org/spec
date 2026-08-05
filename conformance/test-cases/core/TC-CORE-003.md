# TC-CORE-003 — Server Accepts an Invalid Bay Transition as Authoritative

## Profile

Core Profile

> **The server is the implementation under test.** The harness acts as the station and deliberately
> emits transitions the canonical table does not contain. Every other `TC-CORE-*` case tests a
> station; this one tests the other side of the same rule, because the rule it pins is a server
> obligation and nothing else asserts it.

## Purpose

Verify that a server receiving a StatusNotification [MSG-009] whose transition is **not** in
[`05-state-machines.md` §2.3](../../../spec/05-state-machines.md#23-transition-table) does all four
of the things [§2.5](../../../spec/05-state-machines.md#25-invalid-transitions) requires: accepts
the reported state, records the event where an operator can retrieve it, reconciles a session the
new state contradicts, and does **not** reboot the station over it.

Each Part isolates one of the four. A server can fail exactly one and the case says which.

## References

- `spec/05-state-machines.md` §2.5 — the only statement of what an invalid transition costs
- `spec/05-state-machines.md` §2.3 — the canonical transition table the report is judged against
- `spec/05-state-machines.md` §7.2 — Bay–Session coupling
- `spec/profiles/core/status-notification.md` §5, §7 — StatusNotification is an EVENT; no response
- `spec/profiles/device-management/reset.md` — Reset is a reboot and preserves everything persisted
- `spec/04-flows.md` §6 — refund policy applied on session termination

## Preconditions

1. Station `stn_a1b2c3d4` is booted and `Accepted`; the server holds it `Operational`.
2. Bay `bay_c1d2e3f4a5b6` has reported `status: "Available"`, and the server's record says
   `Available`.
3. The server exposes an operator-facing surface for bay anomalies — dashboard, queryable audit
   record, or alert channel. **Which surface is an implementation choice; that one exists is not.**
   The tester records what it is before starting.
4. A payment method is configured such that a session on this bay can be started and settled.

## Steps

### Part A — The state is accepted

1. Emit StatusNotification for `bay_c1d2e3f4a5b6` with `status: "Finishing"`,
   `previousStatus: "Available"`, and a valid `programs[]`. `Available → Finishing` is not in §2.3.
2. Verify the server sends **no** response — StatusNotification is an EVENT.
3. Query the server for the bay's current state. Verify it reads **`Finishing`**.
4. Verify the server has **not** retained `Available`, and has not substituted a third value.

### Part B — The event is retrievable by an operator

5. Using the surface recorded in precondition 3, and **without reading a process log file on the
   server host**, retrieve the record of step 1.
6. Verify the record identifies at least: the station, the bay, and the `(from, to)` pair
   `(Available, Finishing)`.
7. Restart the server process. Repeat step 5. Verify the record survives — §2.5 rule 2 requires it
   be durable, and a record that a redeploy erases was never evidence.

### Part C — A live session is reconciled, not stranded

8. Return the bay to `Available` and start a session on it by the server's normal path, so that
   the server holds the session `Active` and the bay `Occupied`. Note the amount authorized.
9. Emit StatusNotification with `status: "Available"`, `previousStatus: "Occupied"`.
   `Occupied → Available` is not in §2.3: the table's only exits from `Occupied` are `Finishing`
   and `Faulted`.
10. Verify the bay reads `Available` (rule 1 still applies — the state is accepted).
11. Verify the session is **no longer `Active`**. It **MUST** have reached a terminal state.
12. Verify a settlement was produced for it under the refund policy — a charge, a refund, or both.
    A session left `Active` against an `Available` bay is the failure this Part exists to catch.
13. Verify the bay is not simultaneously offered as bookable while the session is still open.

### Part D — No Reset is sent

14. Repeat step 1 on a bay with no session.
15. Observe the `to-station` topic for 60 seconds. Verify **no** Reset [MSG-015] is published.
16. Repeat the invalid transition five more times. Verify still no Reset — §2.5 rule 4 forbids it
    on account of the transition alone, at any repetition count.

## Expected Results

1. The reported `status` becomes the bay's current state, on the first invalid report and on every
   later one.
2. The server sends no response to the EVENT.
3. The event is retrievable through an operator-facing surface, identifies station/bay/from/to, and
   survives a server restart.
4. A session the accepted state contradicts reaches a terminal state and is settled.
5. No Reset [MSG-015] is issued because of an invalid transition, at any repetition count.

## Failure Criteria

1. The server discards the message, or holds the bay at its previous state. The station is the
   authority on its own hardware; a server that declines to be told has a model the hardware has
   already contradicted.
2. The server answers the EVENT.
3. The event reaches only a process log — nothing an operator can query, nothing an alert reads,
   nothing that survives a restart. §2.5 rule 2 is not satisfied by writing a line somewhere.
4. **The session stays `Active` while the bay reads `Available`.** The customer has paid, the
   station says the bay is not serving them, and the server is billing for a bay it is
   simultaneously offering to the next customer. This is the defect the rule exists to prevent, and
   accepting the bay state without it is worse than rejecting the report would have been.
5. The server sends a Reset. Reset preserves everything the station has persisted, so it repairs no
   model disagreement; with `force` it ends a paying customer's session, on the strength of a
   report that may well have been true.
